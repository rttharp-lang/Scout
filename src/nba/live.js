// Live agent runs from the browser. Mirrors the offline research workflow:
// eleven lens agents in parallel → Market Strategist → Fact-Check + Authenticity
// critics in parallel → Brief Editor. Each agent is one or two calls to
// /api/homecourt-agent (research with web search, then compose to schema), so
// every call fits the serverless time limit. Results are saved per market in
// localStorage and can be viewed on the market page in place of the
// published research.
import { LENS_IDS } from "./agents/roster.js";
import { saveLiveRun } from "./data.js";

const RESEARCHERS = new Set([...LENS_IDS, "factcheck"]);
const LENS_CONCURRENCY = 4;

async function call(body, signal) {
  const r = await fetch("/api/homecourt-agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const err = new Error((data && data.error) || `the server returned an error (HTTP ${r.status})`);
    err.status = r.status;
    throw err;
  }
  return data;
}

// One agent: research (if it researches) then compose. Retries once on a
// transient failure.
export async function runAgent(agent, team, inputs, { signal, onStage } = {}) {
  const attempt = async () => {
    let notes;
    if (RESEARCHERS.has(agent)) {
      onStage && onStage("researching");
      notes = (await call({ agent, team, stage: "research", inputs }, signal)).notes;
    }
    onStage && onStage("writing");
    return call({ agent, team, stage: "compose", notes, inputs }, signal);
  };
  try { return await attempt(); } catch (e) {
    if (e.name === "AbortError" || e.status === 503 || e.status === 400) throw e;
    return attempt();
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// Full market run. onUpdate(agentId, { status, stage, ms, warnings, error })
export async function runMarket(team, onUpdate, { signal } = {}) {
  const t0 = {};
  const update = (id, patch) => onUpdate(id, patch);
  const one = async (id, inputs) => {
    t0[id] = performance.now();
    update(id, { status: "running", stage: "starting" });
    try {
      const res = await runAgent(id, team, inputs, { signal, onStage: (stage) => update(id, { status: "running", stage }) });
      update(id, { status: "done", ms: performance.now() - t0[id], warnings: res.warnings || [] });
      return res.data;
    } catch (e) {
      update(id, { status: "failed", error: e.message, ms: performance.now() - t0[id] });
      throw e;
    }
  };

  const run = { team, ranAt: new Date().toISOString(), dossiers: {}, strategy: null, review: {} };

  const lensResults = await pool(LENS_IDS, LENS_CONCURRENCY, (id) => one(id).catch((e) => { if (e.status === 503 || e.name === "AbortError") throw e; return null; }));
  LENS_IDS.forEach((id, i) => { if (lensResults[i]) run.dossiers[id] = lensResults[i]; });
  saveLiveRun(team, run);
  if (Object.keys(run.dossiers).length < LENS_IDS.length) throw new Error(`${LENS_IDS.length - Object.keys(run.dossiers).length} of the ${LENS_IDS.length} research agents failed, and the strategist needs every dossier`);

  run.strategy = await one("strategist", { dossiers: run.dossiers });
  saveLiveRun(team, run);

  const [factcheck, critique] = await Promise.all([
    one("factcheck", { dossiers: run.dossiers, strategy: run.strategy }).catch(() => null),
    one("authenticity", { dossiers: run.dossiers, strategy: run.strategy }).catch(() => null),
  ]);
  run.review = { factcheck, critique };
  saveLiveRun(team, run);

  if (factcheck || critique) {
    run.strategy = await one("editor", { strategy: run.strategy, critique, factcheck, dossiers: run.dossiers }).catch(() => run.strategy);
  }
  run.updated = run.ranAt.slice(0, 10);
  saveLiveRun(team, run);
  return run;
}
