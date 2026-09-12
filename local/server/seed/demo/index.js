// Demo workspace: SYNTHETIC fixtures that exercise the full path from a local
// fan signal → provisional explanation → growth hypothesis → season rhythm →
// uniform territory → collaborative brief. Every source uses a demo:// locator
// and every title is prefixed "[DEMO]". Nothing here is evidence about real
// fans; it lives in its own workspace (kind = "demo") and never mixes with live.
import { one, run, now, uid, J, insertEntity, link, tx, q } from "../../db.js";
import { upsertSource, addEvidence, upsertClaim } from "../../engine/evidence.js";
import { recordObservation } from "../../engine/metrics.js";
import { ensureWorkspace, ensureMembership } from "../index.js";
import { createUser, findUserByEmail } from "../../auth.js";
import { BULLS } from "./bulls.js";
import { LYNX } from "./lynx.js";

export const DEMO_WS = "ws_demo";

export function seedDemo({ adminId } = {}) {
  if (one("SELECT id FROM workspaces WHERE id=?", [DEMO_WS])) return;
  const ws = ensureWorkspace(DEMO_WS, "DEMO workspace — synthetic fixtures", "demo", {
    demo: true, banner: "Synthetic fixtures for demonstration only. No real fans, interviews, sources or metrics.",
    product_milestones: [
      { id: "m1", label: "Territory brief due (NBA 2027-28)", on: "2026-11-15", kind: "briefing", team_id: "nba-chi" },
      { id: "m2", label: "Design review", on: "2027-01-20", kind: "design", team_id: "nba-chi" },
      { id: "m3", label: "Territory brief due (WNBA 2027)", on: "2026-10-30", kind: "briefing", team_id: "wnba-min" },
      { id: "m4", label: "Passed example: 2026 approval gate", on: "2026-08-01", kind: "approval", team_id: "wnba-min" },
    ],
    source_maps: {},
  });
  let editor = findUserByEmail("editor@local.dev") || createUser({ email: "editor@local.dev", name: "Demo editor", password: "local-editor" });
  let viewer = findUserByEmail("viewer@local.dev") || createUser({ email: "viewer@local.dev", name: "Demo viewer", password: "local-viewer" });
  if (adminId) ensureMembership(ws.id, adminId, "admin");
  ensureMembership(ws.id, editor.id, "editor");
  ensureMembership(ws.id, viewer.id, "viewer");
  // Demo users also get read access to the live workspace so collaboration can be tested across roles.
  ensureMembership("ws_live", editor.id, "editor");
  ensureMembership("ws_live", viewer.id, "viewer");
  tx(() => { loadFixture(ws.id, BULLS, editor.id); loadFixture(ws.id, LYNX, editor.id); });
}

function loadFixture(workspace_id, F, userId) {
  const team_id = F.team_id;
  const srcIds = {}; const evIds = {}; const claimIds = {};
  for (const s of F.sources) {
    const { source } = upsertSource({ workspace_id, team_id, locator: `demo://${team_id}/${s.key}`, url: null, title: `[DEMO] ${s.title}`, source_type: s.type, origin: s.origin, publisher: s.publisher || "Synthetic fixture",
      published_at: s.published_at || null, event_at: s.event_at || null, retrieved_at: now(), tz: F.tz, text: s.text, family_id: null, confidential: s.confidential ? 1 : 0,
      access: { synthetic: true, note: "Demo fixture; not a real document" }, retention: { policy: "demo" }, connector_id: "demo", data: { demo: true, syndicated_from: s.syndicated_from || null } });
    srcIds[s.key] = source.id;
    if (s.syndicated_from && srcIds[s.syndicated_from]) run("UPDATE sources SET family_id=?, is_duplicate=1 WHERE id=?", [srcIds[s.syndicated_from], source.id]);
  }
  const communities = {};
  for (const c of F.communities) { const e = insertEntity({ entity_type: "fan_community", workspace_id, team_id, title: c.title, status: "draft", data: { ...c, demo: true } }); communities[c.key] = e.id; }
  for (const e of F.evidence) {
    const ev = addEvidence({ workspace_id, team_id, source_id: srcIds[e.source], excerpt: e.excerpt, position: e.position || null, place: e.place || null, topic: e.topic || null, local_relevance_reason: e.why_local,
      geo_relevance: e.geo, evidence_mode: e.mode, engagement: e.engagement || null, taxonomy_version: 1, community_id: e.community ? communities[e.community] : null, alternatives: e.alternatives || [], codes: e.codes, coder: "demo-fixture", coder_kind: "human", data: { demo: true, event_date: e.event_date || null } });
    evIds[e.key] = ev.id;
  }
  for (const c of F.claims) {
    const cl = upsertClaim({ workspace_id, team_id, statement: c.statement, headline: c.headline, label: c.label, section: c.section, prominence: c.prominence || 1, alternatives: c.alternatives || [], disconfirming: c.disconfirming, review_state: c.review_state || "draft",
      taxonomy_version: 1, created_by: userId, evidence: c.evidence.map(([key, stance, explanation]) => ({ evidence_id: evIds[key], stance, explanation })), codes: c.codes, coder: "demo-fixture", coder_kind: "human",
      data: { demo: true, community: c.community || null, behavior_vs_motive: c.behavior_vs_motive || null, uniform_relevance: c.uniform_relevance || null, image: c.image || null } });
    claimIds[c.key] = cl.id;
    if (c.community && communities[c.community]) link("claim", cl.id, "fan_community", communities[c.community], "about");
  }
  const cids = (keys = []) => keys.map((k) => claimIds[k]).filter(Boolean);
  const mk = (type, title, data, extra = {}) => insertEntity({ entity_type: type, workspace_id, team_id, title, status: extra.status || "draft", taxonomy_version: 1, created_by: userId, data: { ...data, demo: true }, ...extra });
  const profiles = F.profiles.map((p) => mk("fan_profile", p.title, { ...p, claim_ids: cids(p.claims) }, { status: p.status || "needs_validation" }));
  for (const h of F.motivation_hypotheses) mk("motivation_hypothesis", h.title, { ...h, claim_ids: cids(h.claims) }, { status: h.status || "draft" });
  for (const o of F.outcomes) mk("outcome_definition", o.title, o, { status: "approved_for_brief" });
  for (const g of F.growth_hypotheses) mk("growth_hypothesis", g.title, { ...g, claim_ids: cids(g.claims) }, { status: g.status || "draft" });
  const momentIds = {};
  for (const m of F.moments) { const e = mk("moment", m.title, { ...m, claim_ids: cids(m.claims) }, { starts_at: m.date || null, ends_at: m.end || null, status: m.status || "draft" }); momentIds[m.key] = e.id; }
  for (const m of F.metrics) recordObservation({ workspace_id, team_id, ...m });
  const oppIds = {};
  for (const t of F.territories) {
    const e = mk("opportunity", t.title, { ...t, supporting_claim_ids: cids(t.supporting), conflicting_claim_ids: cids(t.conflicting), moment_ids: (t.moments || []).map((k) => momentIds[k]).filter(Boolean), scoring: t.scoring || null }, { status: t.status || "draft" });
    oppIds[t.key] = e.id;
    for (const k of t.supporting) if (claimIds[k]) link("opportunity", e.id, "claim", claimIds[k], "supports");
    for (const k of t.conflicting || []) if (claimIds[k]) link("opportunity", e.id, "claim", claimIds[k], "conflicts");
    for (const k of t.moments || []) if (momentIds[k]) link("opportunity", e.id, "moment", momentIds[k], "timed_to");
  }
  for (const b of F.briefs) {
    const v1 = mk("brief_version", b.title, { ...b, version: 1, opportunity_id: oppIds[b.opportunity], author: "Demo editor" }, { parent_id: oppIds[b.opportunity], status: b.status || "needs_validation", version: 1 });
    if (b.v2) mk("brief_version", b.title, { ...b, ...b.v2, version: 2, opportunity_id: oppIds[b.opportunity], author: "Demo editor" }, { parent_id: oppIds[b.opportunity], status: b.v2.status || "needs_validation", version: 2 });
    for (const c of b.comments || []) mk("comment", null, { body: c, author: "Demo editor", target_type: "opportunity", target_id: oppIds[b.opportunity] }, { parent_id: oppIds[b.opportunity], status: "open" });
    for (const d of b.decisions || []) mk("decision", d.title, { ...d, target_type: "opportunity", target_id: oppIds[b.opportunity], decided_by: "Demo editor" }, { parent_id: oppIds[b.opportunity], status: "recorded" });
  }
  for (const v of F.validation) {
    const study = mk("validation_study", v.title, { ...v, human_collection_required: true }, { status: v.status || "draft" });
    for (const r of v.responses || []) insertEntity({ entity_type: "research_response", workspace_id, team_id, title: r.label, status: "restricted", parent_id: study.id, confidential: 1, created_by: userId, data: { ...r, demo: true, access: "restricted: editors and admins only; aggregate summaries are visible to viewers" } });
  }
  for (const u of F.uploads || []) mk("upload", u.title, u, { confidential: 1, status: "stored" });
  // A completed demo research run with tasks so Research Studio shows the workflow shape (labeled as fixture, never executed).
  const runId = uid("run"); const t0 = now();
  run(`INSERT INTO research_runs(id,workspace_id,team_id,question,scope,budget,spent,state,plan,summary,created_by,parent_run_id,model_info,started_at,finished_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [runId, workspace_id, team_id, F.run.question, J({ depth: "standard", demo: true }), J({ max_tasks: 14, max_sources: 60, max_wall_seconds: 900, max_usd: 3 }), J({ tasks: F.run.tasks.length, sources: F.sources.length, usd: 0 }), "complete",
     J({ specialists: F.run.tasks.map((t) => t.specialist), demo: true, note: "Fixture run: illustrates workflow shape; no tools were executed." }), J({ note: "DEMO fixture run. Task outputs are illustrative.", claims_created: F.claims.length, sources_with_evidence: F.sources.length, coverage_gaps: F.run.gaps, unresolved_questions: F.run.unresolved }),
     userId, null, J({ configured: false, provider: "none", demo: true }), t0, t0, t0, t0]);
  for (const t of F.run.tasks) run(`INSERT INTO agent_tasks(id,run_id,workspace_id,team_id,specialist,question,phase,state,idempotency_key,attempt,input,output,tools_used,sources_found,unresolved,cost,started_at,finished_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [uid("task"), runId, workspace_id, team_id, t.specialist, F.run.question, t.phase, t.state, `${runId}:${t.phase}:${t.specialist}`, 1, J({ demo: true }), J({ summary: t.summary, demo: true }), J(t.tools), t.sources || 0, J(t.unresolved || []), J({}), t0, t0, t0, t0]);
  for (const c of F.claims) if (claimIds[c.key]) run("UPDATE claims SET run_id=? WHERE id=?", [runId, claimIds[c.key]]);
  run("INSERT OR REPLACE INTO team_state(workspace_id,team_id,owner_user_id,saved_by,last_reviewed_at,coverage) VALUES(?,?,?,?,?,?)", [workspace_id, team_id, userId, J([userId]), t0, J({ demo: true, sections: F.coverage })]);
  mk("notification", `What changed: ${F.team_name}`, { items: F.what_changed, since: "last review" }, { status: "unread" });
}
