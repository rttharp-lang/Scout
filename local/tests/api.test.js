// HTTP-level authorization tests against the real Express app on a temp DB.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

process.env.NODE_ENV = "test";
process.env.LOCAL_DB_PATH = path.join(os.tmpdir(), `local-api-test-${Date.now()}.db`);
process.env.LOCAL_SEED_DEMO = "true";
const { default: app } = await import("../server/index.js");
const server = app.listen(0); const PORT = server.address().port; const BASE = `http://localhost:${PORT}/api`;

async function login(email, password) { const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }); const cookie = r.headers.get("set-cookie")?.split(";")[0]; return { status: r.status, cookie }; }
const get = (p, cookie) => fetch(`${BASE}${p}`, { headers: cookie ? { cookie } : {} });
const post = (p, body, cookie) => fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

test("unauthenticated and unauthorized access is denied", async () => {
  assert.equal((await get("/workspaces/ws_demo/portfolio")).status, 401);
  const { status, cookie } = await login("viewer@local.dev", "local-viewer"); assert.equal(status, 200);
  assert.equal((await get("/workspaces/ws_demo/portfolio", cookie)).status, 200);
  assert.equal((await get("/workspaces/ws_nope/portfolio", cookie)).status, 403, "no membership => forbidden");
  assert.equal((await get("/workspaces/ws_demo/entities/research_response", cookie)).status, 403, "viewers cannot read individual responses");
  assert.equal((await get("/workspaces/ws_demo/audit", cookie)).status, 403);
  assert.equal((await post("/workspaces/ws_demo/runs", { team_id: "nba-chi", question: "x" }, cookie)).status, 403, "viewers cannot launch runs");
  const bad = await login("viewer@local.dev", "wrong"); assert.equal(bad.status, 401);
});

test("viewer exports exclude confidential evidence; editor exports include it", async () => {
  const v = (await login("viewer@local.dev", "local-viewer")).cookie; const e = (await login("editor@local.dev", "local-editor")).cookie;
  const dv = await (await get("/workspaces/ws_demo/teams/nba-chi/export/dossier", v)).json();
  const de = await (await get("/workspaces/ws_demo/teams/nba-chi/export/dossier", e)).json();
  assert.equal(dv.includes_confidential, false); assert.equal(de.includes_confidential, true);
  const hasRestricted = (d) => d.claims.some((c) => c.evidence.some((x) => x.source_confidential === 1));
  assert.equal(hasRestricted(dv), false); assert.equal(hasRestricted(de), true);
  assert.equal(dv.workspace.kind, "demo"); assert.ok(dv.workspace.note.includes("DEMO"));
});

test("editor can add contradicting evidence; affected approved territory is flagged", async () => {
  const e = (await login("editor@local.dev", "local-editor")).cookie;
  const dossier = await (await get("/workspaces/ws_demo/teams/nba-chi/dossier", e)).json();
  const opp = dossier.opportunities[0]; const claimId = opp.data.supporting_claim_ids[0];
  await fetch(`${BASE}/workspaces/ws_demo/entities/opportunity/${opp.id}`, { method: "PATCH", headers: { "content-type": "application/json", cookie: e }, body: JSON.stringify({ status: "approved_for_brief" }) });
  const src = await (await post("/workspaces/ws_demo/uploads", { team_id: "nba-chi", title: "New interview", text: "Participant says the intro is irrelevant to them; the walk with friends matters.", consent: "internal" }, e)).json();
  const ev = await (await post("/workspaces/ws_demo/evidence", { source_id: src.id, excerpt: "the intro is irrelevant to them", evidence_mode: "testimony", geo_relevance: "verified" }, e)).json();
  const c = await (await post(`/workspaces/ws_demo/claims/${claimId}/evidence`, { evidence_id: ev.id, stance: "contradicts", explanation: "new testimony" }, e)).json();
  assert.ok(c.confidence_computed.factors.contradiction.includes("contradicting"));
  const after = await (await get(`/workspaces/ws_demo/entities/opportunity/${opp.id}`, e)).json();
  assert.equal(after.status, "needs_validation"); assert.ok(after.data.review_flag);
  const notes = await (await get("/workspaces/ws_demo/entities/notification?team_id=nba-chi", e)).json();
  assert.ok(notes.some((n) => n.data.claim_id === claimId));
});

test("taxonomy change → human review → new version with migration; old codes keep version", async () => {
  const a = (await login("admin@local.dev", "local-admin")).cookie;
  const ch = await (await post("/workspaces/ws_demo/taxonomy/changes", { kind: "add", rationale: "local branch", payload: { layer: "expression", parent_id: "exp.ritual", name: "Lights down intro", definition: "Bulls-specific arena intro ritual", team_id: "nba-chi" } }, a)).json();
  const rev = await (await post(`/workspaces/ws_demo/taxonomy/changes/${ch.id}/review`, { decision: "approved" }, a)).json();
  assert.equal(rev.status, "approved"); assert.equal(rev.version, 2); assert.ok(rev.migrations.some((m) => m.kind === "added"));
  const t = await (await get("/workspaces/ws_demo/taxonomy", a)).json(); assert.equal(t.current, 2); assert.ok(t.nodes.find((n) => n.scope === "team:nba-chi"));
  const t1 = await (await get("/workspaces/ws_demo/taxonomy?version=1", a)).json(); assert.ok(!t1.nodes.find((n) => n.scope === "team:nba-chi"), "v1 unchanged");
});

test("ask answers from evidence with citations and admits unknowns", async () => {
  const v = (await login("viewer@local.dev", "local-viewer")).cookie;
  const a = await (await post("/workspaces/ws_demo/teams/nba-chi/ask", { question: "What happens at the intro?" }, v)).json();
  assert.ok(a.citations.length > 0); assert.ok(a.answer.length > 20);
  const b = await (await post("/workspaces/ws_demo/teams/wnba-tor/ask", { question: "What happens at the intro?" }, v)).json();
  assert.ok(b.answer.includes("don't know")); assert.equal(b.suggest_run, true);
});

test("research run via API persists and reaches a terminal state", async () => {
  const e = (await login("editor@local.dev", "local-editor")).cookie;
  const r = await (await post("/workspaces/ws_live/runs", { team_id: "nba-chi", question: "API run", scope: { depth: "quick" }, budget: { max_wall_seconds: 60 } }, e)).json();
  assert.equal(r.state, "queued");
  let state = r.state; for (let i = 0; i < 120 && ["queued", "researching", "challenging", "following_up", "synthesizing"].includes(state); i++) { await new Promise((x) => setTimeout(x, 500)); state = (await (await get(`/workspaces/ws_live/runs/${r.id}`, e)).json()).state; }
  assert.ok(["complete", "partial", "failed"].includes(state), `terminal, got ${state}`);
});

test.after(() => { server.close(); for (const s of ["", "-wal", "-shm"]) fs.rmSync(process.env.LOCAL_DB_PATH + s, { force: true }); });
