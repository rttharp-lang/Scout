// Persistent workflow orchestrator. Runs and tasks live in SQLite; a worker
// loop leases queued tasks (bounded concurrency), executes phases in order
// (plan → discover/fanout → consolidate → challenge → follow-up → synthesize),
// enforces per-run budgets (tasks, sources, wall time, spend), retries
// idempotently, resumes after restart, and honors cancellation.
import crypto from "node:crypto";
import { q, one, run, rows, row, now, uid, J, P, audit, insertEntity } from "../db.js";
import { SPECIALISTS, byId, routeSpecialists, runResearchTask, runReviewTask, runSynthesisTask } from "./specialists/index.js";
import { llmStatus } from "./llm.js";
import { listConnectors } from "./connectors/index.js";

export const RUN_STATES = ["queued", "researching", "challenging", "following_up", "synthesizing", "complete", "partial", "failed", "canceled"];
const DEFAULT_BUDGET = { max_tasks: 14, max_sources: 60, max_wall_seconds: 900, max_usd: 3, max_followups: 3, concurrency: 3 };
const GLOBAL_CONCURRENCY = Number(process.env.LOCAL_MAX_CONCURRENT_TASKS || 3);
const LEASE_SECONDS = 180;
const aborts = new Map(); // run_id -> AbortController

export function createRun({ workspace_id, team_id, question, scope = {}, budget = {}, created_by = null, parent_run_id = null }) {
  const id = uid("run");
  const b = { ...DEFAULT_BUDGET, ...budget };
  const t = now();
  run(`INSERT INTO research_runs(id,workspace_id,team_id,question,scope,budget,spent,state,plan,summary,created_by,parent_run_id,model_info,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, workspace_id, team_id, question, J(scope), J(b), J({ tasks: 0, sources: 0, usd: 0 }), "queued", J({}), J({}), created_by, parent_run_id, J({ ...llmStatus() }), t, t]);
  enqueue({ run_id: id, workspace_id, team_id, specialist: "planner", phase: "plan", question });
  audit({ workspace_id, user_id: created_by, action: "run.created", target_type: "research_run", target_id: id, detail: { question, scope, budget: b } });
  return getRun(id);
}

function enqueue({ run_id, workspace_id, team_id, specialist, phase, question, input = {} }) {
  const key = `${run_id}:${phase}:${specialist}:${crypto.createHash("sha1").update(question).digest("hex").slice(0, 12)}`;
  const t = now();
  const existing = one("SELECT id FROM agent_tasks WHERE idempotency_key=?", [key]);
  if (existing) return existing.id;
  const id = uid("task");
  run(`INSERT INTO agent_tasks(id,run_id,workspace_id,team_id,specialist,question,phase,state,idempotency_key,input,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, run_id, workspace_id, team_id, specialist, question, phase, "queued", key, J(input), t, t]);
  return id;
}

export function getRun(id) {
  const r = row(one("SELECT * FROM research_runs WHERE id=?", [id]));
  if (!r) return null;
  r.tasks = rows(q("SELECT id,run_id,specialist,question,phase,state,attempt,tools_used,sources_found,unresolved,error,cost,started_at,finished_at,created_at,updated_at FROM agent_tasks WHERE run_id=? ORDER BY created_at", [id]));
  r.elapsed_seconds = r.started_at ? Math.round((Date.parse(r.finished_at || now()) - Date.parse(r.started_at)) / 1000) : 0;
  return r;
}
export function listRuns(workspace_id, team_id) {
  const sql = "SELECT * FROM research_runs WHERE workspace_id=?" + (team_id ? " AND team_id=?" : "") + " ORDER BY created_at DESC LIMIT 100";
  return rows(q(sql, team_id ? [workspace_id, team_id] : [workspace_id]));
}
export function getTask(id) { return row(one("SELECT * FROM agent_tasks WHERE id=?", [id])); }

export function cancelRun(id, user_id = null) {
  const r = getRun(id); if (!r) return null;
  if (["complete", "partial", "failed", "canceled"].includes(r.state)) return r;
  run("UPDATE research_runs SET state='canceled', finished_at=?, updated_at=? WHERE id=?", [now(), now(), id]);
  run("UPDATE agent_tasks SET state='canceled', updated_at=? WHERE run_id=? AND state IN ('queued','running')", [now(), id]);
  aborts.get(id)?.abort();
  audit({ workspace_id: r.workspace_id, user_id, action: "run.canceled", target_type: "research_run", target_id: id });
  return getRun(id);
}

// Targeted follow-up: a child run with one specialist and question.
export function requestFollowup({ run_id, specialist, question, created_by }) {
  const parent = getRun(run_id); if (!parent) throw new Error("run not found");
  const child = createRun({ workspace_id: parent.workspace_id, team_id: parent.team_id, question, scope: { ...parent.scope, specialists: [specialist], followup: true }, budget: { max_tasks: 4, max_usd: 1, max_followups: 0 }, created_by, parent_run_id: run_id });
  return child;
}

function setRunState(id, state, extra = {}) {
  const sets = ["state=?", "updated_at=?"]; const params = [state, now()];
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k}=?`); params.push(typeof v === "object" ? J(v) : v); }
  params.push(id);
  run(`UPDATE research_runs SET ${sets.join(", ")} WHERE id=?`, params);
}
function addSpend(run_id, delta) {
  const r = one("SELECT spent, budget FROM research_runs WHERE id=?", [run_id]);
  const s = P(r.spent, {}); s.tasks = (s.tasks || 0) + (delta.tasks || 0); s.sources = (s.sources || 0) + (delta.sources || 0); s.usd = +((s.usd || 0) + (delta.usd || 0)).toFixed(4);
  run("UPDATE research_runs SET spent=?, updated_at=? WHERE id=?", [J(s), now(), run_id]);
  return { spent: s, budget: P(r.budget, DEFAULT_BUDGET) };
}
function budgetExceeded(run_id) {
  const r = one("SELECT spent, budget, started_at FROM research_runs WHERE id=?", [run_id]);
  const s = P(r.spent, {}), b = P(r.budget, DEFAULT_BUDGET);
  const wall = r.started_at ? (Date.now() - Date.parse(r.started_at)) / 1000 : 0;
  const researchTasks = one("SELECT COUNT(*) AS n FROM agent_tasks WHERE run_id=? AND phase IN ('fanout','followup') AND state NOT IN ('queued')", [run_id]).n;
  if (researchTasks >= b.max_tasks) return `task budget reached (${researchTasks}/${b.max_tasks} research tasks)`;
  if (s.sources >= b.max_sources) return `source budget reached (${s.sources}/${b.max_sources})`;
  if (s.usd >= b.max_usd) return `spend budget reached ($${s.usd}/$${b.max_usd})`;
  if (wall >= b.max_wall_seconds) return `wall-time budget reached (${Math.round(wall)}s/${b.max_wall_seconds}s)`;
  return null;
}

// Deterministic planner (LLM-free): maps knowns/unknowns, coverage, competing hypotheses and disconfirmers.
function buildPlan(runRow, ctx) {
  const scope = runRow.scope || {};
  const specialists = scope.specialists?.length ? scope.specialists : routeSpecialists(runRow.question, scope.depth || "standard");
  const connectors = Object.fromEntries(listConnectors().map((c) => [c.id, c.state]));
  const existingClaims = q("SELECT section, COUNT(*) AS n FROM claims WHERE workspace_id=? AND team_id=? GROUP BY section", [runRow.workspace_id, runRow.team_id]);
  const coverage = Object.fromEntries(existingClaims.map((r) => [r.section || "uncoded", r.n]));
  const layers = q("SELECT substr(node_id,1,3) AS layer, COUNT(*) AS n FROM evidence_codes WHERE workspace_id=? AND target_id IN (SELECT id FROM claims WHERE team_id=?) GROUP BY layer", [runRow.workspace_id, runRow.team_id]);
  const hypotheses = [
    { motivation: "mot.connection", hypothesis: "Participation is sustained by relationships and gathering places specific to this market.", disconfirm: "Fans describe solitary or convenience-driven participation without named people or places." },
    { motivation: "mot.identity", hypothesis: "Wearing team product expresses a locally specific civic or neighborhood identity.", disconfirm: "Fans cite generic style or price reasons and cannot articulate what the allegiance says about them." },
    { motivation: "mot.continuity", hypothesis: "Inherited rituals and family stories anchor long-tenured fans.", disconfirm: "Long-tenured fans point to athlete eras or convenience rather than inheritance." },
    { motivation: "mot.other.athlete", hypothesis: "Current attention is athlete-specific and may not transfer to team identity.", disconfirm: "Fan practices persist across roster changes." },
  ];
  const growth = [
    { stage: "gro.stage.access", hypothesis: "First participation is limited by access (price, transit, broadcast) more than relevance.", outcome: "trial", disconfirm: "Prospective fans report awareness gaps rather than access barriers." },
    { stage: "gro.stage.welcome", hypothesis: "Insider codes strengthen established fandom but raise entry barriers for newcomers.", outcome: "repeat", disconfirm: "Newcomers report codes as inviting rather than excluding." },
  ];
  const usable = specialists.filter((s) => { const sp = byId[s]; if (!sp) return false; if (sp.requires && !sp.requires.some((c) => ["connected", "limited"].includes(connectors[c]))) return false; return true; });
  const skipped = specialists.filter((s) => !usable.includes(s)).map((s) => ({ specialist: s, reason: "required connectors not connected" }));
  return { specialists: usable, skipped, connectors, coverage, coded_layers: layers, competing_hypotheses: hypotheses, growth_hypotheses: growth,
    priority_questions: [runRow.question, "What do fans create, repeat, wear, defend and reject without team direction?", "Who is missing from the accessible evidence?"], llm: llmStatus().configured, planned_at: now() };
}

function loadCtx(runRow) {
  const workspace = row(one("SELECT * FROM workspaces WHERE id=?", [runRow.workspace_id]));
  const team = row(one("SELECT * FROM teams WHERE id=?", [runRow.team_id]));
  const version = Number(one("SELECT MAX(version) AS v FROM taxonomy_versions")?.v || 1);
  const taxonomy = rows(q("SELECT id,name,definition,layer FROM taxonomy_nodes WHERE version=? AND status='active' AND (scope='shared' OR team_id=?)", [version, runRow.team_id]));
  const sourceMap = workspace.settings?.source_maps?.[runRow.team_id] || {};
  const seasons = rows(q("SELECT * FROM seasons WHERE league_id=?", [team.league_id]));
  const limits = { max_sources_per_task: runRow.scope?.max_sources_per_task || 8, max_chars: 40000 };
  return { workspace, team: { ...team, tricode: team.registry?.tricode }, taxonomy, taxonomyVersion: version, sourceMap, seasons, limits };
}

async function executeTask(task) {
  const runRow = row(one("SELECT * FROM research_runs WHERE id=?", [task.run_id]));
  if (!runRow || runRow.state === "canceled") { run("UPDATE agent_tasks SET state='canceled', updated_at=? WHERE id=?", [now(), task.id]); return; }
  if (!aborts.has(runRow.id)) aborts.set(runRow.id, new AbortController());
  const signal = aborts.get(runRow.id).signal;
  const ctx = { ...loadCtx(runRow), signal };
  const started = now();
  run("UPDATE agent_tasks SET state='running', attempt=attempt+1, started_at=COALESCE(started_at,?), lease_until=?, updated_at=? WHERE id=?", [started, new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(), started, task.id]);
  if (!runRow.started_at) setRunState(runRow.id, "researching", { started_at: started });
  try {
    let result;
    if (task.phase === "plan") {
      const plan = buildPlan(runRow, ctx);
      setRunState(runRow.id, "researching", { plan });
      for (const s of plan.specialists) enqueue({ run_id: runRow.id, workspace_id: runRow.workspace_id, team_id: runRow.team_id, specialist: s, phase: "fanout", question: runRow.question });
      result = { output: plan, tools_used: ["planner"], sources_found: 0, unresolved: plan.skipped.map((s) => `${s.specialist}: ${s.reason}`), cost: {}, state: "complete" };
    } else if (task.phase === "fanout" || task.phase === "followup") {
      result = await runResearchTask(task, ctx);
    } else if (task.phase === "consolidate") {
      result = consolidate(runRow);
    } else if (task.phase === "challenge") {
      result = await runReviewTask(task, ctx);
    } else if (task.phase === "synthesize") {
      result = task.specialist === "local_validation" ? validationPlan(runRow, ctx) : await runSynthesisTask(task, ctx);
    } else throw new Error(`unknown phase ${task.phase}`);
    const finalState = ["blocked", "credentials_required", "no_sources"].includes(result.state) ? result.state : "complete";
    run("UPDATE agent_tasks SET state=?, output=?, tools_used=?, sources_found=?, unresolved=?, cost=?, finished_at=?, lease_until=NULL, updated_at=? WHERE id=?",
      [finalState, J(result.output), J(result.tools_used), result.sources_found || 0, J(result.unresolved || []), J(result.cost || {}), now(), now(), task.id]);
    addSpend(runRow.id, { tasks: 1, sources: result.sources_found || 0, usd: result.cost?.usd || 0 });
    // Follow-up routing (bounded).
    const budget = runRow.budget || DEFAULT_BUDGET;
    const followupsSoFar = one("SELECT COUNT(*) AS n FROM agent_tasks WHERE run_id=? AND phase='followup'", [runRow.id]).n;
    for (const f of (result.followups || []).slice(0, Math.max(0, (budget.max_followups || 0) - followupsSoFar))) {
      if (byId[f.specialist] && !budgetExceeded(runRow.id)) enqueue({ run_id: runRow.id, workspace_id: runRow.workspace_id, team_id: runRow.team_id, specialist: f.specialist, phase: "followup", question: f.question, input: { why: f.why, from_task: task.id } });
    }
  } catch (e) {
    const retryable = e.retryable || /network|timeout|ECONN|fetch failed/i.test(String(e.message));
    const t = getTask(task.id);
    const code = e.code || "error";
    if (code === "credentials_required") {
      run("UPDATE agent_tasks SET state='credentials_required', error=?, finished_at=?, lease_until=NULL, updated_at=? WHERE id=?", [String(e.message), now(), now(), task.id]);
      addSpend(runRow.id, { tasks: 1 });
    } else if (retryable && t.attempt < t.max_attempts && !signal.aborted) {
      run("UPDATE agent_tasks SET state='queued', error=?, lease_until=NULL, updated_at=? WHERE id=?", [`retry ${t.attempt}/${t.max_attempts}: ${e.message}`, now(), task.id]);
    } else {
      run("UPDATE agent_tasks SET state='failed', error=?, finished_at=?, lease_until=NULL, updated_at=? WHERE id=?", [String(e.message), now(), now(), task.id]);
      addSpend(runRow.id, { tasks: 1 });
    }
  }
  advance(runRow.id);
}

// Deterministic consolidation: dedupe families, map contradictions, tally origins.
function consolidate(runRow) {
  const sources = rows(q("SELECT id,family_id,is_duplicate,origin,url,title FROM sources WHERE workspace_id=? AND team_id=? AND id IN (SELECT source_id FROM evidence WHERE run_id=?)", [runRow.workspace_id, runRow.team_id, runRow.id]));
  const families = new Set(sources.map((s) => s.family_id));
  const origins = {}; for (const s of sources) origins[s.origin] = (origins[s.origin] || 0) + 1;
  const claims = rows(q("SELECT id, statement, label, alternatives FROM claims WHERE run_id=?", [runRow.id]));
  const contradictions = rows(q("SELECT ce.claim_id, COUNT(*) AS n FROM claim_evidence ce JOIN claims c ON c.id=ce.claim_id WHERE c.run_id=? AND ce.stance='contradicts' GROUP BY ce.claim_id", [runRow.id]));
  const allSources = rows(q("SELECT COUNT(*) AS n, SUM(is_duplicate) AS d FROM sources WHERE workspace_id=? AND team_id=?", [runRow.workspace_id, runRow.team_id]))[0];
  return { output: { sources_in_run: sources.length, independent_families: families.size, duplicates_collapsed: sources.length - families.size, origins, claims: claims.length, claims_with_contradicting_evidence: contradictions, team_source_total: allSources.n, team_duplicates_total: allSources.d || 0 },
    tools_used: ["consolidator"], sources_found: 0, unresolved: [], cost: {}, state: "complete" };
}

// Validation plan without a model: neutral, behavior-based guide from the taxonomy.
function validationPlan(runRow, ctx) {
  const questions = [
    "Tell us about the last time you wore something with this team on it. Where were you going, and who were you with?",
    "Why that piece and not another one you own?",
    "Walk us through a typical game day, from when you wake up. What stays the same every time?",
    "Who first brought you to this team? What do you remember about that?",
    "What would you miss if that routine disappeared for a season?",
    "Is there anything about how this team is presented that does not feel like yours? What would you change?",
    "When did you stop paying attention for a while, if ever? What brought you back, or what would?",
  ];
  const study = { entity_type: "validation_study", workspace_id: runRow.workspace_id, team_id: runRow.team_id, title: `Discussion guide: ${runRow.question.slice(0, 60)}`, status: "draft", run_id: runRow.id,
    data: { kind: "discussion_guide", questions, sampling: "Seek variation across established, newer, casual, lapsed and prospective fans; include quiet and offline fans. Recruit through season-ticket lists, community partners, local retailers, and open calls; document who could not be reached.", limitations: "Qualitative; no population shares. Human collection requires consent, permissions and explicit authorization.", human_collection_required: true } };
  const created = insertEntity(study);
  return { output: { validation_study_id: created.id, questions }, tools_used: ["validation-designer"], sources_found: 0, unresolved: [], cost: {}, state: "complete" };
}

// Move a run forward when a phase completes.
function advance(run_id) {
  const r = row(one("SELECT * FROM research_runs WHERE id=?", [run_id]));
  if (!r || ["complete", "partial", "failed", "canceled"].includes(r.state)) return;
  const tasks = rows(q("SELECT * FROM agent_tasks WHERE run_id=?", [run_id]));
  const open = tasks.filter((t) => ["queued", "running"].includes(t.state));
  if (open.length) return; // still working
  const over = budgetExceeded(run_id);
  const has = (phase) => tasks.some((t) => t.phase === phase);
  const enq = (specialist, phase) => enqueue({ run_id, workspace_id: r.workspace_id, team_id: r.team_id, specialist, phase, question: r.question });
  if (over) return finish(run_id, `Stopped: ${over}.`);
  if (!has("consolidate")) { enq("consolidator", "consolidate"); return; }
  if (!has("challenge")) { setRunState(run_id, "challenging"); enq("evidence_reviewer", "challenge"); enq("taxonomy_steward", "challenge"); if (r.plan?.specialists?.includes("community_stewardship")) enq("community_stewardship", "challenge"); return; }
  const followups = tasks.filter((t) => t.phase === "followup");
  if (followups.length && r.state !== "following_up" && followups.some((t) => t.state === "queued")) { setRunState(run_id, "following_up"); return; }
  if (!has("synthesize")) { setRunState(run_id, "synthesizing"); enq("uniform_synthesizer", "synthesize"); enq("local_validation", "synthesize"); return; }
  finish(run_id);
}

function finish(run_id, note = null) {
  const tasks = rows(q("SELECT * FROM agent_tasks WHERE run_id=?", [run_id]));
  const r = row(one("SELECT * FROM research_runs WHERE id=?", [run_id]));
  const counts = {}; for (const t of tasks) counts[t.state] = (counts[t.state] || 0) + 1;
  const research = tasks.filter((t) => ["fanout", "followup"].includes(t.phase));
  const blocked = research.filter((t) => ["blocked", "credentials_required", "failed", "no_sources"].includes(t.state));
  const state = research.length && blocked.length === research.length ? "failed" : (blocked.length || note || counts.credentials_required) ? "partial" : "complete";
  const claims = one("SELECT COUNT(*) AS n FROM claims WHERE run_id=?", [run_id]).n;
  const sources = one("SELECT COUNT(DISTINCT source_id) AS n FROM evidence WHERE run_id=?", [run_id]).n;
  const unresolved = [...new Set(tasks.flatMap((t) => t.unresolved || []))];
  const gaps = [];
  if (!llmStatus().configured) gaps.push("Model provider not configured: sources were gathered where reachable but no agent findings, review or synthesis were generated.");
  if (tasks.some((t) => t.state === "blocked")) gaps.push("Live sources could not be retrieved from this host (egress blocked or access restricted).");
  if (tasks.some((t) => t.state === "no_sources")) gaps.push("Some specialists had no configured sources for this team: add a team source map (feeds, local media, fan sites) in Workspace Settings or upload research.");
  const summary = { note, task_states: counts, claims_created: claims, sources_with_evidence: sources, unresolved_questions: unresolved.slice(0, 40), coverage_gaps: gaps,
    residual_uncertainty: state === "complete" ? "See per-claim confidence rationale and unresolved questions." : "Run did not reach full coverage; see coverage_gaps." };
  setRunState(run_id, state, { summary, finished_at: now() });
  aborts.delete(run_id);
  audit({ workspace_id: r.workspace_id, action: `run.${state}`, target_type: "research_run", target_id: run_id, detail: summary });
}

// Worker loop -------------------------------------------------------------
let running = 0; let timer = null;
export function startWorker({ intervalMs = 1500 } = {}) {
  // Resume: tasks left "running" by a previous process with expired leases go back to queued (idempotent).
  run("UPDATE agent_tasks SET state='queued', lease_until=NULL, updated_at=? WHERE state='running' AND (lease_until IS NULL OR lease_until < ?)", [now(), now()]);
  for (const r of rows(q("SELECT id FROM research_runs WHERE state IN ('queued','researching','challenging','following_up','synthesizing')"))) advance(r.id);
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
export async function tick() {
  if (running >= GLOBAL_CONCURRENCY) return;
  const candidates = rows(q("SELECT t.* FROM agent_tasks t JOIN research_runs r ON r.id=t.run_id WHERE t.state='queued' AND r.state NOT IN ('canceled','complete','partial','failed') ORDER BY t.created_at LIMIT ?", [GLOBAL_CONCURRENCY - running]));
  for (const t of candidates) {
    const perRun = one("SELECT COUNT(*) AS n FROM agent_tasks WHERE run_id=? AND state='running'", [t.run_id]).n;
    const b = P(one("SELECT budget FROM research_runs WHERE id=?", [t.run_id]).budget, DEFAULT_BUDGET);
    if (perRun >= (b.concurrency || 3)) continue;
    if (t.phase !== "plan" && budgetExceeded(t.run_id)) { run("UPDATE agent_tasks SET state='skipped_budget', updated_at=? WHERE id=?", [now(), t.id]); advance(t.run_id); continue; }
    running++;
    executeTask(t).catch((e) => console.error("task error", e)).finally(() => { running--; });
  }
}
// Run the loop until a run reaches a terminal state (used by tests and the CLI).
export async function drain(run_id, { timeoutMs = 60000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await tick();
    const r = one("SELECT state FROM research_runs WHERE id=?", [run_id]);
    if (["complete", "partial", "failed", "canceled"].includes(r?.state)) return getRun(run_id);
    await new Promise((res) => setTimeout(res, 50));
  }
  return getRun(run_id);
}
export { SPECIALISTS };
