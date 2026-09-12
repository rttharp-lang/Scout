// HTTP API. Every workspace route enforces membership + role server-side.
// Confidential records (research responses, uploads, confidential briefs)
// require editor+; viewers see aggregate summaries only.
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { q, one, run, rows, row, now, uid, J, audit, insertEntity, updateEntity, getEntity, listEntities, link, linksFrom, linksTo, tx } from "../db.js";
import { createUser, findUserByEmail, verifyPassword, createSession, destroySession, setSessionCookie, clearSessionCookie, requireAuth, requireRole, roleFor, ROLE_RANK } from "../auth.js";
import { upsertSource, addEvidence, upsertClaim, getClaim, codeTarget, codesFor, evidenceForTeam } from "../engine/evidence.js";
import { createRun, getRun, listRuns, cancelRun, requestFollowup, getTask, SPECIALISTS } from "../engine/orchestrator.js";
import { checkConnectors, listConnectors } from "../engine/connectors/index.js";
import { llmStatus } from "../engine/llm.js";
import { seriesFor, observations, recordObservation } from "../engine/metrics.js";
import { createSchedule, listSchedules, setScheduleEnabled, deleteSchedule } from "../scheduler.js";
import { LAYERS } from "../seed/taxonomy.js";
import { ensureMembership } from "../seed/index.js";

const r = express.Router();
const ok = (res, data) => res.json(data);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const isEditor = (req) => ROLE_RANK[req.role] >= ROLE_RANK.editor;

// ---- auth ------------------------------------------------------------------
r.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const u = email && findUserByEmail(email);
  if (!u || !verifyPassword(password || "", u.password_hash)) { audit({ action: "auth.failed", detail: { email } }); return bad(res, "invalid_credentials", 401); }
  const s = createSession(u.id); setSessionCookie(res, s, req);
  audit({ user_id: u.id, action: "auth.login" });
  ok(res, { user: { id: u.id, email: u.email, name: u.name, is_platform_admin: u.is_platform_admin } });
});
r.post("/auth/logout", (req, res) => { if (req.sessionId) destroySession(req.sessionId); clearSessionCookie(res); ok(res, { ok: true }); });
r.get("/auth/me", (req, res) => {
  if (!req.user) return ok(res, { user: null, workspaces: [] });
  const ms = rows(q("SELECT m.workspace_id, m.role, w.name, w.kind, w.settings FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=?", [req.user.id]));
  const wsList = req.user.is_platform_admin ? rows(q("SELECT id AS workspace_id, 'admin' AS role, name, kind, settings FROM workspaces")) : ms;
  ok(res, { user: req.user, workspaces: wsList, llm: llmStatus() });
});

// ---- registry --------------------------------------------------------------
r.get("/leagues", (req, res) => ok(res, rows(q("SELECT * FROM leagues"))));
r.get("/teams", (req, res) => ok(res, rows(q("SELECT * FROM teams ORDER BY league_id, name"))));
r.get("/teams/:teamId", (req, res) => { const t = row(one("SELECT * FROM teams WHERE id=?", [req.params.teamId])); t ? ok(res, t) : bad(res, "not_found", 404); });
r.get("/seasons", (req, res) => ok(res, rows(q("SELECT * FROM seasons ORDER BY starts_on"))));
r.get("/specialists", (req, res) => ok(res, SPECIALISTS.map((s) => ({ id: s.id, name: s.name, responsibility: s.responsibility, phase: s.phase, kind: s.kind, requires: s.requires || [] }))));
r.get("/connectors", requireAuth, (req, res) => ok(res, listConnectors()));
r.post("/connectors/check", requireAuth, async (req, res) => ok(res, await checkConnectors()));
r.get("/taxonomy/layers", (req, res) => ok(res, LAYERS));

// ---- workspace-scoped ------------------------------------------------------
const W = "/workspaces/:workspaceId";
r.get(`${W}`, requireRole("viewer"), (req, res) => {
  const ws = row(one("SELECT * FROM workspaces WHERE id=?", [req.workspaceId]));
  const members = rows(q("SELECT m.user_id, m.role, u.name, u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=?", [req.workspaceId]));
  ok(res, { ...ws, role: req.role, members: isEditor(req) ? members : members.map((m) => ({ user_id: m.user_id, role: m.role, name: m.name })) });
});
r.patch(`${W}/settings`, requireRole("admin"), (req, res) => {
  const ws = row(one("SELECT * FROM workspaces WHERE id=?", [req.workspaceId]));
  const settings = { ...ws.settings, ...(req.body || {}) };
  run("UPDATE workspaces SET settings=? WHERE id=?", [J(settings), req.workspaceId]);
  audit({ workspace_id: req.workspaceId, user_id: req.user.id, action: "workspace.settings", detail: Object.keys(req.body || {}) });
  ok(res, { ...ws, settings });
});
r.post(`${W}/members`, requireRole("admin"), (req, res) => {
  const { email, name, role, password } = req.body || {};
  if (!email || !["admin", "editor", "viewer"].includes(role)) return bad(res, "email_and_valid_role_required");
  let u = findUserByEmail(email);
  if (!u) { if (!password) return bad(res, "password_required_for_new_user"); u = createUser({ email, name: name || email, password }); }
  ensureMembership(req.workspaceId, u.id, role);
  audit({ workspace_id: req.workspaceId, user_id: req.user.id, action: "member.upsert", target_type: "user", target_id: u.id, detail: { role } });
  ok(res, { user_id: u.id, role });
});
r.delete(`${W}/members/:userId`, requireRole("admin"), (req, res) => { run("DELETE FROM memberships WHERE workspace_id=? AND user_id=?", [req.workspaceId, req.params.userId]); ok(res, { ok: true }); });
r.get(`${W}/audit`, requireRole("admin"), (req, res) => ok(res, rows(q("SELECT * FROM audit_events WHERE workspace_id=? ORDER BY id DESC LIMIT 200", [req.workspaceId]))));

// Portfolio: freshness, coverage, gaps, upcoming moments, decisions due, changes.
r.get(`${W}/portfolio`, requireRole("viewer"), (req, res) => {
  const teams = rows(q("SELECT * FROM teams WHERE status='active' ORDER BY league_id, name"));
  const claimsBy = Object.fromEntries(q("SELECT team_id, COUNT(*) AS n, MAX(updated_at) AS last FROM claims WHERE workspace_id=? GROUP BY team_id", [req.workspaceId]).map((x) => [x.team_id, x]));
  const runsBy = Object.fromEntries(q("SELECT team_id, COUNT(*) AS n, MAX(created_at) AS last, SUM(state IN ('queued','researching','challenging','following_up','synthesizing')) AS active FROM research_runs WHERE workspace_id=? GROUP BY team_id", [req.workspaceId]).map((x) => [x.team_id, x]));
  const oppBy = Object.fromEntries(q("SELECT team_id, COUNT(*) AS n FROM entities WHERE workspace_id=? AND entity_type='opportunity' GROUP BY team_id", [req.workspaceId]).map((x) => [x.team_id, x.n]));
  const profBy = Object.fromEntries(q("SELECT team_id, COUNT(*) AS n FROM entities WHERE workspace_id=? AND entity_type='fan_profile' GROUP BY team_id", [req.workspaceId]).map((x) => [x.team_id, x.n]));
  const growBy = Object.fromEntries(q("SELECT team_id, COUNT(*) AS n FROM entities WHERE workspace_id=? AND entity_type='growth_hypothesis' GROUP BY team_id", [req.workspaceId]).map((x) => [x.team_id, x.n]));
  const stateBy = Object.fromEntries(rows(q("SELECT * FROM team_state WHERE workspace_id=?", [req.workspaceId])).map((x) => [x.team_id, x]));
  const upcoming = rows(q("SELECT team_id, title, starts_at, data FROM entities WHERE workspace_id=? AND entity_type='moment' AND starts_at >= ? ORDER BY starts_at LIMIT 30", [req.workspaceId, now().slice(0, 10)]));
  const ws = row(one("SELECT * FROM workspaces WHERE id=?", [req.workspaceId]));
  const milestones = (ws.settings.product_milestones || []).map((m) => ({ ...m, passed: m.on < now().slice(0, 10) }));
  const notifications = rows(q("SELECT * FROM entities WHERE workspace_id=? AND entity_type='notification' ORDER BY created_at DESC LIMIT 20", [req.workspaceId]));
  ok(res, { teams: teams.map((t) => ({ id: t.id, name: t.name, league_id: t.league_id, colors: t.colors, claims: claimsBy[t.id]?.n || 0, last_updated: claimsBy[t.id]?.last || null, runs: runsBy[t.id]?.n || 0, active_runs: runsBy[t.id]?.active || 0,
    opportunities: oppBy[t.id] || 0, profiles: profBy[t.id] || 0, growth: growBy[t.id] || 0, researched: Boolean(claimsBy[t.id]), state: stateBy[t.id] || null,
    gaps: [!profBy[t.id] && "motivation", !growBy[t.id] && "growth", !oppBy[t.id] && "uniform"].filter(Boolean) })), upcoming, milestones, notifications });
});

// Team dossier: everything the Team World screens need, evidence one click away.
r.get(`${W}/teams/:teamId/dossier`, requireRole("viewer"), (req, res) => {
  const { workspaceId: w } = req; const teamId = req.params.teamId;
  const team = row(one("SELECT * FROM teams WHERE id=?", [teamId])); if (!team) return bad(res, "not_found", 404);
  const claims = rows(q("SELECT * FROM claims WHERE workspace_id=? AND team_id=? AND review_state != 'archived' ORDER BY prominence DESC, updated_at DESC", [w, teamId])).map((c) => ({ ...c, codes: codesFor("claim", c.id), evidence_count: one("SELECT COUNT(*) AS n FROM claim_evidence WHERE claim_id=?", [c.id]).n, contradictions: one("SELECT COUNT(*) AS n FROM claim_evidence WHERE claim_id=? AND stance='contradicts'", [c.id]).n }));
  const ent = (type) => listEntities(w, type, { team_id: teamId }).filter((e) => !e.confidential || isEditor(req));
  const state = row(one("SELECT * FROM team_state WHERE workspace_id=? AND team_id=?", [w, teamId]));
  const runs = listRuns(w, teamId);
  const media = ent("media");
  const ws = row(one("SELECT * FROM workspaces WHERE id=?", [w]));
  ok(res, { team, workspace: { id: ws.id, kind: ws.kind, banner: ws.settings.banner || null }, state, claims, communities: ent("fan_community"), profiles: ent("fan_profile"), motivation_hypotheses: ent("motivation_hypothesis"), growth: ent("growth_hypothesis"), outcomes: ent("outcome_definition"),
    moments: ent("moment"), opportunities: ent("opportunity"), briefs: ent("brief_version"), validation: ent("validation_study"), dossiers: ent("dossier_version"), notifications: ent("notification"), media, runs: runs.slice(0, 10),
    seasons: rows(q("SELECT * FROM seasons WHERE league_id=? ORDER BY starts_on", [team.league_id])), milestones: (ws.settings.product_milestones || []).filter((m) => !m.team_id || m.team_id === teamId).map((m) => ({ ...m, passed: m.on < now().slice(0, 10) })),
    evidence_summary: { total: one("SELECT COUNT(*) AS n FROM evidence WHERE workspace_id=? AND team_id=?", [w, teamId]).n, sources: one("SELECT COUNT(*) AS n FROM sources WHERE workspace_id=? AND team_id=?", [w, teamId]).n, families: one("SELECT COUNT(DISTINCT family_id) AS n FROM sources WHERE workspace_id=? AND team_id=?", [w, teamId]).n,
      origins: Object.fromEntries(q("SELECT origin, COUNT(*) AS n FROM sources WHERE workspace_id=? AND team_id=? GROUP BY origin", [w, teamId]).map((x) => [x.origin, x.n])) } });
});
r.post(`${W}/teams/:teamId/save`, requireRole("viewer"), (req, res) => {
  const cur = row(one("SELECT * FROM team_state WHERE workspace_id=? AND team_id=?", [req.workspaceId, req.params.teamId]));
  const saved = new Set(cur?.saved_by || []); saved.has(req.user.id) ? saved.delete(req.user.id) : saved.add(req.user.id);
  run("INSERT INTO team_state(workspace_id,team_id,owner_user_id,saved_by,last_reviewed_at,coverage) VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,team_id) DO UPDATE SET saved_by=excluded.saved_by", [req.workspaceId, req.params.teamId, cur?.owner_user_id || null, J([...saved]), cur?.last_reviewed_at || null, J(cur?.coverage || {})]);
  ok(res, { saved: saved.has(req.user.id) });
});
r.post(`${W}/teams/:teamId/owner`, requireRole("editor"), (req, res) => {
  run("INSERT INTO team_state(workspace_id,team_id,owner_user_id,saved_by,last_reviewed_at,coverage) VALUES(?,?,?,'[]',NULL,'{}') ON CONFLICT(workspace_id,team_id) DO UPDATE SET owner_user_id=excluded.owner_user_id", [req.workspaceId, req.params.teamId, req.body.user_id || req.user.id]);
  ok(res, { ok: true });
});
r.post(`${W}/teams/:teamId/reviewed`, requireRole("editor"), (req, res) => {
  run("INSERT INTO team_state(workspace_id,team_id,owner_user_id,saved_by,last_reviewed_at,coverage) VALUES(?,?,NULL,'[]',?,'{}') ON CONFLICT(workspace_id,team_id) DO UPDATE SET last_reviewed_at=excluded.last_reviewed_at", [req.workspaceId, req.params.teamId, now()]);
  run("UPDATE entities SET status='read' WHERE workspace_id=? AND team_id=? AND entity_type='notification'", [req.workspaceId, req.params.teamId]);
  ok(res, { ok: true });
});
// What changed since last review.
r.get(`${W}/teams/:teamId/changes`, requireRole("viewer"), (req, res) => {
  const st = row(one("SELECT * FROM team_state WHERE workspace_id=? AND team_id=?", [req.workspaceId, req.params.teamId]));
  const since = req.query.since || st?.last_reviewed_at || "1970-01-01";
  ok(res, { since, claims: rows(q("SELECT id, headline, label, confidence, review_state, updated_at, version FROM claims WHERE workspace_id=? AND team_id=? AND updated_at > ? ORDER BY updated_at DESC", [req.workspaceId, req.params.teamId, since])),
    entities: rows(q("SELECT id, entity_type, title, status, updated_at FROM entities WHERE workspace_id=? AND team_id=? AND updated_at > ? AND entity_type NOT IN ('metric_observation','notification') ORDER BY updated_at DESC LIMIT 100", [req.workspaceId, req.params.teamId, since])),
    runs: rows(q("SELECT id, question, state, finished_at FROM research_runs WHERE workspace_id=? AND team_id=? AND updated_at > ?", [req.workspaceId, req.params.teamId, since])) });
});

// ---- claims & evidence -----------------------------------------------------
r.get(`${W}/claims/:claimId`, requireRole("viewer"), (req, res) => {
  const c = getClaim(req.params.claimId, { includeConfidential: isEditor(req) });
  if (!c || c.workspace_id !== req.workspaceId) return bad(res, "not_found", 404);
  c.comments = listEntities(req.workspaceId, "comment", { parent_id: c.id });
  c.communities = linksFrom("claim", c.id, "about").map((l) => getEntity(l.to_id)).filter(Boolean);
  c.opportunities = linksTo("claim", c.id).map((l) => getEntity(l.from_id)).filter(Boolean);
  ok(res, c);
});
r.post(`${W}/claims`, requireRole("editor"), (req, res) => {
  const b = req.body || {}; if (!b.team_id || !b.statement) return bad(res, "team_id_and_statement_required");
  const c = upsertClaim({ ...b, workspace_id: req.workspaceId, created_by: req.user.id, coder: req.user.email, coder_kind: "human" });
  audit({ workspace_id: req.workspaceId, user_id: req.user.id, action: "claim.create", target_type: "claim", target_id: c.id });
  ok(res, c);
});
r.patch(`${W}/claims/:claimId`, requireRole("editor"), (req, res) => {
  const cur = getClaim(req.params.claimId); if (!cur || cur.workspace_id !== req.workspaceId) return bad(res, "not_found", 404);
  const b = req.body || {};
  if (b.review_state) {
    // Approval is a human workflow state; never derived from agent confidence.
    if (!["draft", "needs_validation", "validated", "approved_for_brief", "archived"].includes(b.review_state)) return bad(res, "bad_review_state");
    run("UPDATE claims SET review_state=?, updated_at=? WHERE id=?", [b.review_state, now(), cur.id]);
  }
  const c = upsertClaim({ ...b, id: cur.id, workspace_id: req.workspaceId, team_id: cur.team_id, coder: req.user.email, coder_kind: "human" });
  audit({ workspace_id: req.workspaceId, user_id: req.user.id, action: "claim.update", target_type: "claim", target_id: c.id, detail: Object.keys(b) });
  ok(res, c);
});
r.post(`${W}/claims/:claimId/evidence`, requireRole("editor"), (req, res) => {
  const cur = getClaim(req.params.claimId); if (!cur || cur.workspace_id !== req.workspaceId) return bad(res, "not_found", 404);
  const { evidence_id, stance = "supports", explanation } = req.body || {};
  run("INSERT OR REPLACE INTO claim_evidence(claim_id,evidence_id,stance,explanation) VALUES(?,?,?,?)", [cur.id, evidence_id, stance, explanation || null]);
  const c = upsertClaim({ id: cur.id, workspace_id: req.workspaceId, team_id: cur.team_id });
  // Contradictory evidence flags affected briefs for review.
  if (stance === "contradicts") {
    const affected = linksTo("claim", cur.id, "supports").map((l) => l.from_id);
    for (const oid of affected) { const o = getEntity(oid); if (o && o.status === "approved_for_brief") updateEntity(oid, { status: "needs_validation", data: { review_flag: `Contradicting evidence added to claim ${cur.id} on ${now()}` } }); }
    insertEntity({ entity_type: "notification", workspace_id: req.workspaceId, team_id: cur.team_id, title: `Contradicting evidence added to "${cur.headline || cur.statement.slice(0, 50)}"`, status: "unread", data: { claim_id: cur.id, affected_opportunities: affected } });
  }
  ok(res, c);
});
r.get(`${W}/evidence`, requireRole("viewer"), (req, res) => {
  const { team_id, q: text, origin, mode, stale, contradictions, status } = req.query;
  let sql = `SELECT e.*, s.url, s.locator, s.title AS source_title, s.source_type, s.origin, s.publisher, s.published_at, s.family_id, s.is_duplicate FROM evidence e JOIN sources s ON s.id=e.source_id WHERE e.workspace_id=?`;
  const p = [req.workspaceId];
  if (!isEditor(req)) sql += " AND e.confidential=0 AND s.confidential=0";
  if (team_id) { sql += " AND e.team_id=?"; p.push(team_id); }
  if (origin) { sql += " AND s.origin=?"; p.push(origin); }
  if (mode) { sql += " AND e.evidence_mode=?"; p.push(mode); }
  if (status) { sql += " AND e.validation_status=?"; p.push(status); }
  if (text) { sql += " AND (e.excerpt LIKE ? OR s.title LIKE ? OR e.topic LIKE ?)"; p.push(`%${text}%`, `%${text}%`, `%${text}%`); }
  if (stale === "1") { sql += " AND (s.published_at IS NULL OR s.published_at < ?)"; p.push(new Date(Date.now() - 2 * 365 * 864e5).toISOString()); }
  if (contradictions === "1") sql += " AND e.id IN (SELECT evidence_id FROM claim_evidence WHERE stance='contradicts')";
  sql += " ORDER BY e.created_at DESC LIMIT 300";
  const items = rows(q(sql, p)).map((e) => ({ ...e, codes: codesFor("evidence", e.id), claims: rows(q("SELECT ce.stance, c.id, c.headline, c.label FROM claim_evidence ce JOIN claims c ON c.id=ce.claim_id WHERE ce.evidence_id=?", [e.id])) }));
  ok(res, items);
});
r.get(`${W}/sources`, requireRole("viewer"), (req, res) => {
  let sql = "SELECT * FROM sources WHERE workspace_id=?"; const p = [req.workspaceId];
  if (!isEditor(req)) sql += " AND confidential=0";
  if (req.query.team_id) { sql += " AND team_id=?"; p.push(req.query.team_id); }
  sql += " ORDER BY created_at DESC LIMIT 300";
  ok(res, rows(q(sql, p)).map((s) => ({ ...s, data: { ...s.data, text: s.data?.text ? s.data.text.slice(0, 600) : undefined } })));
});
r.get(`${W}/sources/:sourceId`, requireRole("viewer"), (req, res) => {
  const s = row(one("SELECT * FROM sources WHERE id=? AND workspace_id=?", [req.params.sourceId, req.workspaceId]));
  if (!s || (s.confidential && !isEditor(req))) return bad(res, "not_found", 404);
  s.evidence = rows(q("SELECT * FROM evidence WHERE source_id=?", [s.id])); s.family = rows(q("SELECT id,title,url,locator,is_duplicate FROM sources WHERE family_id=? AND id != ?", [s.family_id, s.id]));
  ok(res, s);
});
// Manual upload of research (interviews, notes, decks, analytics) with provenance & permissions. Confidential by default.
r.post(`${W}/uploads`, requireRole("editor"), (req, res) => {
  const b = req.body || {}; if (!b.team_id || !b.text || !b.title) return bad(res, "team_id_title_text_required");
  const { source } = upsertSource({ workspace_id: req.workspaceId, team_id: b.team_id, locator: `upload://${uid("doc")}`, title: b.title, source_type: b.source_type || "internal_document", origin: "internal", publisher: b.provenance || req.user.name, author: b.author || null,
    published_at: b.date || null, text: b.text, confidential: b.confidential !== false, access: { consent: b.consent || "unspecified", use_limits: b.use_limits || "internal research only", uploaded_by: req.user.id }, retention: { policy: b.retention || "workspace-default", delete_after: b.delete_after || null }, connector_id: "upload", data: { kind: b.kind || "document" } });
  audit({ workspace_id: req.workspaceId, user_id: req.user.id, action: "upload.create", target_type: "source", target_id: source.id });
  ok(res, source);
});
r.post(`${W}/evidence`, requireRole("editor"), (req, res) => {
  const b = req.body || {}; if (!b.source_id || !b.excerpt) return bad(res, "source_id_and_excerpt_required");
  const src = one("SELECT * FROM sources WHERE id=? AND workspace_id=?", [b.source_id, req.workspaceId]); if (!src) return bad(res, "source_not_found", 404);
  const ev = addEvidence({ ...b, workspace_id: req.workspaceId, team_id: b.team_id || src.team_id, confidential: src.confidential, coder: req.user.email, coder_kind: "human", taxonomy_version: b.taxonomy_version || currentTaxVersion() });
  ok(res, ev);
});
r.post(`${W}/codes`, requireRole("editor"), (req, res) => {
  const b = req.body || {}; if (!b.target_type || !b.target_id || !b.node_id) return bad(res, "target_and_node_required");
  codeTarget({ workspace_id: req.workspaceId, target_type: b.target_type, target_id: b.target_id, node_id: b.node_id, taxonomy_version: b.taxonomy_version || currentTaxVersion(), coder: req.user.email, coder_kind: "human", note: b.note });
  ok(res, codesFor(b.target_type, b.target_id));
});
r.delete(`${W}/codes/:codeId`, requireRole("editor"), (req, res) => { run("DELETE FROM evidence_codes WHERE id=? AND workspace_id=?", [req.params.codeId, req.workspaceId]); ok(res, { ok: true }); });
// Coding agreement: targets with multiple coders, disagreement rate by node.
r.get(`${W}/coding/agreement`, requireRole("viewer"), (req, res) => {
  const multi = rows(q(`SELECT target_type, target_id, COUNT(DISTINCT coder) AS coders, GROUP_CONCAT(DISTINCT node_id) AS nodes, GROUP_CONCAT(DISTINCT coder) AS coder_list FROM evidence_codes WHERE workspace_id=? GROUP BY target_type, target_id HAVING coders > 1`, [req.workspaceId]));
  const items = multi.map((m) => { const per = rows(q("SELECT coder, GROUP_CONCAT(node_id) AS nodes FROM evidence_codes WHERE target_type=? AND target_id=? GROUP BY coder", [m.target_type, m.target_id])); const sets = per.map((p) => new Set(p.nodes.split(","))); const all = new Set(per.flatMap((p) => p.nodes.split(","))); const agreed = [...all].filter((n) => sets.every((s) => s.has(n))); return { ...m, per_coder: per, agreement: all.size ? agreed.length / all.size : 1, disagreed: [...all].filter((n) => !agreed.includes(n)) }; });
  ok(res, { double_coded: items.length, mean_agreement: items.length ? items.reduce((a, b) => a + b.agreement, 0) / items.length : null, items, note: "Coding agreement is reported separately from confidence that an explanation is true." });
});

// ---- generic entities (profiles, growth, moments, opportunities, briefs, comments, decisions, studies, responses, media, saved views)
const ENTITY_TYPES = new Set(["fan_community", "fan_profile", "motivation_hypothesis", "growth_hypothesis", "outcome_definition", "moment", "opportunity", "brief_version", "comment", "decision", "validation_study", "research_response", "media", "saved_view", "milestone", "notification", "dossier_version", "research_request"]);
const CONFIDENTIAL_TYPES = new Set(["research_response", "upload"]);
r.get(`${W}/entities/:type`, requireRole("viewer"), (req, res) => {
  const type = req.params.type; if (!ENTITY_TYPES.has(type)) return bad(res, "bad_type");
  if (CONFIDENTIAL_TYPES.has(type) && !isEditor(req)) return bad(res, "forbidden_confidential", 403);
  const items = listEntities(req.workspaceId, type, { team_id: req.query.team_id, status: req.query.status, parent_id: req.query.parent_id }).filter((e) => !e.confidential || isEditor(req));
  ok(res, items);
});
r.get(`${W}/entities/:type/:id`, requireRole("viewer"), (req, res) => {
  const e = getEntity(req.params.id); if (!e || e.workspace_id !== req.workspaceId) return bad(res, "not_found", 404);
  if (e.confidential && !isEditor(req)) return bad(res, "forbidden_confidential", 403);
  e.links = linksFrom(e.entity_type, e.id); e.linked_claims = e.links.filter((l) => l.to_type === "claim").map((l) => getClaim(l.to_id, { includeConfidential: isEditor(req) })).filter(Boolean);
  const idList = [...(e.data.claim_ids || []), ...(e.data.supporting_claim_ids || []), ...(e.data.conflicting_claim_ids || [])];
  e.claims = idList.map((id) => getClaim(id, { includeConfidential: isEditor(req) })).filter(Boolean);
  e.comments = listEntities(req.workspaceId, "comment", { parent_id: e.id }); e.decisions = listEntities(req.workspaceId, "decision", { parent_id: e.id });
  e.versions = e.entity_type === "opportunity" ? listEntities(req.workspaceId, "brief_version", { parent_id: e.id }) : [];
  if (e.entity_type === "validation_study") { e.response_count = one("SELECT COUNT(*) AS n FROM entities WHERE parent_id=? AND entity_type='research_response'", [e.id]).n; e.responses = isEditor(req) ? listEntities(req.workspaceId, "research_response", { parent_id: e.id }) : undefined; }
  ok(res, e);
});
r.post(`${W}/entities/:type`, requireRole("editor"), (req, res) => {
  const type = req.params.type; if (!ENTITY_TYPES.has(type)) return bad(res, "bad_type");
  const b = req.body || {};
  const e = insertEntity({ entity_type: type, workspace_id: req.workspaceId, team_id: b.team_id || null, title: b.title || null, status: b.status || "draft", parent_id: b.parent_id || null, confidential: CONFIDENTIAL_TYPES.has(type) || b.confidential ? 1 : 0, created_by: req.user.id, starts_at: b.starts_at || null, ends_at: b.ends_at || null, taxonomy_version: currentTaxVersion(), data: { ...(b.data || {}), author: req.user.name } });
  for (const cid of b.claim_ids || []) link(type, e.id, "claim", cid, "supports");
  if (type === "brief_version" && b.parent_id) { const n = one("SELECT COUNT(*) AS n FROM entities WHERE parent_id=? AND entity_type='brief_version'", [b.parent_id]).n; updateEntity(e.id, { version: n }); }
  if (type === "research_response") { const study = getEntity(b.parent_id); if (study) updateEntity(study.id, { data: { last_response_at: now() } }); }
  audit({ workspace_id: req.workspaceId, user_id: req.user.id, action: `${type}.create`, target_type: type, target_id: e.id });
  ok(res, getEntity(e.id));
});
r.patch(`${W}/entities/:type/:id`, requireRole("editor"), (req, res) => {
  const e = getEntity(req.params.id); if (!e || e.workspace_id !== req.workspaceId) return bad(res, "not_found", 404);
  const b = req.body || {};
  if (b.status && ["approved_for_brief", "validated"].includes(b.status) && e.entity_type === "opportunity") {
    // Human approval; record a decision entity for traceability.
    insertEntity({ entity_type: "decision", workspace_id: req.workspaceId, team_id: e.team_id, title: `${b.status.replace(/_/g, " ")}: ${e.title}`, parent_id: e.id, status: "recorded", created_by: req.user.id, data: { by: req.user.name, at: now(), note: b.decision_note || null, target_type: e.entity_type, target_id: e.id } });
  }
  const u = updateEntity(e.id, b);
  audit({ workspace_id: req.workspaceId, user_id: req.user.id, action: `${e.entity_type}.update`, target_type: e.entity_type, target_id: e.id, detail: Object.keys(b) });
  ok(res, u);
});
r.delete(`${W}/entities/:type/:id`, requireRole("admin"), (req, res) => { run("DELETE FROM entities WHERE id=? AND workspace_id=?", [req.params.id, req.workspaceId]); ok(res, { ok: true }); });
r.post(`${W}/links`, requireRole("editor"), (req, res) => { const b = req.body || {}; link(b.from_type, b.from_id, b.to_type, b.to_id, b.relation || "related"); ok(res, { ok: true }); });

// ---- taxonomy --------------------------------------------------------------
function currentTaxVersion() { return Number(one("SELECT MAX(version) AS v FROM taxonomy_versions")?.v || 1); }
r.get(`${W}/taxonomy`, requireRole("viewer"), (req, res) => {
  const version = Number(req.query.version || currentTaxVersion());
  const nodes = rows(q("SELECT * FROM taxonomy_nodes WHERE version=? ORDER BY layer, id", [version]));
  const usage = Object.fromEntries(q("SELECT node_id, COUNT(*) AS n FROM evidence_codes WHERE workspace_id=? GROUP BY node_id", [req.workspaceId]).map((x) => [x.node_id, x.n]));
  ok(res, { version, current: currentTaxVersion(), layers: LAYERS, nodes: nodes.map((n) => ({ ...n, usage: usage[n.id] || 0 })), versions: rows(q("SELECT * FROM taxonomy_versions ORDER BY version")), changes: rows(q("SELECT * FROM taxonomy_changes WHERE workspace_id=? ORDER BY created_at DESC", [req.workspaceId])) });
});
r.post(`${W}/taxonomy/changes`, requireRole("editor"), (req, res) => {
  const b = req.body || {}; if (!["add", "edit", "rename", "merge", "retire"].includes(b.kind)) return bad(res, "bad_kind");
  const id = uid("tch");
  run("INSERT INTO taxonomy_changes(id,workspace_id,proposed_by,kind,payload,rationale,status,created_at) VALUES(?,?,?,?,?,?,'proposed',?)", [id, req.workspaceId, req.user.id, b.kind, J(b.payload || {}), b.rationale || null, now()]);
  ok(res, row(one("SELECT * FROM taxonomy_changes WHERE id=?", [id])));
});
// Human review: approving a change creates a new taxonomy version with migration mappings; historical codes keep their version.
r.post(`${W}/taxonomy/changes/:id/review`, requireRole("admin"), (req, res) => {
  const ch = row(one("SELECT * FROM taxonomy_changes WHERE id=? AND workspace_id=?", [req.params.id, req.workspaceId])); if (!ch) return bad(res, "not_found", 404);
  const { decision } = req.body || {}; if (!["approved", "rejected"].includes(decision)) return bad(res, "bad_decision");
  if (decision === "rejected") { run("UPDATE taxonomy_changes SET status='rejected', reviewed_by=?, reviewed_at=? WHERE id=?", [req.user.id, now(), ch.id]); return ok(res, { status: "rejected" }); }
  const prev = currentTaxVersion(); const next = prev + 1; const p = ch.payload; const migrations = [];
  tx(() => {
    const nodes = rows(q("SELECT * FROM taxonomy_nodes WHERE version=?", [prev]));
    for (const n of nodes) {
      let m = { ...n };
      if (ch.kind === "edit" && n.id === p.id) m = { ...m, ...p.fields };
      if (ch.kind === "rename" && n.id === p.id) { m.name = p.name || m.name; migrations.push({ from: n.id, to: n.id, kind: "renamed", note: `${n.name} → ${p.name}` }); }
      if (ch.kind === "retire" && n.id === p.id) { m.status = "retired"; migrations.push({ from: n.id, to: p.replacement || null, kind: "retired" }); }
      if (ch.kind === "merge" && p.from?.includes(n.id)) { m.status = "merged"; migrations.push({ from: n.id, to: p.into, kind: "merged" }); }
      run(`INSERT INTO taxonomy_nodes(id,version,layer,parent_id,name,definition,inclusion,exclusion,synonyms,examples,counterexamples,evidence_requirements,owner,scope,team_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [m.id, next, m.layer, m.parent_id, m.name, m.definition, m.inclusion, m.exclusion, J(m.synonyms), J(m.examples), J(m.counterexamples), m.evidence_requirements, m.owner, m.scope, m.team_id, m.status]);
    }
    if (ch.kind === "add") {
      const id = p.id || `${p.parent_id || p.layer}.${(p.name || "node").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      run(`INSERT INTO taxonomy_nodes(id,version,layer,parent_id,name,definition,inclusion,exclusion,synonyms,examples,counterexamples,evidence_requirements,owner,scope,team_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, next, p.layer, p.parent_id || null, p.name, p.definition || "", p.inclusion || "", p.exclusion || "", J(p.synonyms || []), J(p.examples || []), J(p.counterexamples || []), p.evidence_requirements || "", req.user.email, p.team_id ? `team:${p.team_id}` : "shared", p.team_id || null, "active"]);
      migrations.push({ from: null, to: id, kind: "added" });
    }
    run("INSERT INTO taxonomy_versions(version,workspace_id,note,created_by,created_at,migrations) VALUES(?,?,?,?,?,?)", [next, req.workspaceId, `${ch.kind}: ${ch.rationale || ""}`, req.user.id, now(), J(migrations)]);
    run("UPDATE taxonomy_changes SET status='approved', reviewed_by=?, reviewed_at=? WHERE id=?", [req.user.id, now(), ch.id]);
  });
  audit({ workspace_id: req.workspaceId, user_id: req.user.id, action: "taxonomy.version", detail: { version: next, migrations } });
  ok(res, { status: "approved", version: next, migrations });
});

// ---- research runs ---------------------------------------------------------
r.get(`${W}/runs`, requireRole("viewer"), (req, res) => ok(res, listRuns(req.workspaceId, req.query.team_id)));
r.post(`${W}/runs`, requireRole("editor"), (req, res) => {
  const b = req.body || {}; if (!b.team_id || !b.question) return bad(res, "team_id_and_question_required");
  const ws = row(one("SELECT * FROM workspaces WHERE id=?", [req.workspaceId]));
  const cap = ws.settings.budget_limits || {}; const budget = { ...(b.budget || {}) };
  if (cap.max_usd_per_run && (budget.max_usd || 3) > cap.max_usd_per_run) budget.max_usd = cap.max_usd_per_run;
  const runRow = createRun({ workspace_id: req.workspaceId, team_id: b.team_id, question: b.question, scope: b.scope || {}, budget, created_by: req.user.id });
  ok(res, runRow);
});
r.get(`${W}/runs/:runId`, requireRole("viewer"), (req, res) => { const x = getRun(req.params.runId); x && x.workspace_id === req.workspaceId ? ok(res, x) : bad(res, "not_found", 404); });
r.get(`${W}/runs/:runId/tasks/:taskId`, requireRole("viewer"), (req, res) => { const t = getTask(req.params.taskId); t && t.workspace_id === req.workspaceId ? ok(res, t) : bad(res, "not_found", 404); });
r.post(`${W}/runs/:runId/cancel`, requireRole("editor"), (req, res) => { const x = getRun(req.params.runId); if (!x || x.workspace_id !== req.workspaceId) return bad(res, "not_found", 404); ok(res, cancelRun(x.id, req.user.id)); });
r.post(`${W}/runs/:runId/followup`, requireRole("editor"), (req, res) => { const x = getRun(req.params.runId); if (!x || x.workspace_id !== req.workspaceId) return bad(res, "not_found", 404); const { specialist, question } = req.body || {}; if (!specialist || !question) return bad(res, "specialist_and_question_required"); ok(res, requestFollowup({ run_id: x.id, specialist, question, created_by: req.user.id })); });
r.get(`${W}/schedules`, requireRole("viewer"), (req, res) => ok(res, listSchedules(req.workspaceId)));
r.post(`${W}/schedules`, requireRole("admin"), (req, res) => ok(res, createSchedule({ ...req.body, workspace_id: req.workspaceId, created_by: req.user.id })));
r.patch(`${W}/schedules/:id`, requireRole("admin"), (req, res) => { setScheduleEnabled(req.params.id, req.body.enabled); ok(res, { ok: true }); });
r.delete(`${W}/schedules/:id`, requireRole("admin"), (req, res) => { deleteSchedule(req.params.id); ok(res, { ok: true }); });

// ---- metrics ---------------------------------------------------------------
r.get(`${W}/teams/:teamId/metrics`, requireRole("viewer"), (req, res) => {
  const obs = observations(req.workspaceId, req.params.teamId);
  const keys = [...new Set(obs.map((o) => `${o.data.platform}|${o.data.metric}`))];
  ok(res, keys.map((k) => { const [platform, metric] = k.split("|"); return seriesFor(req.workspaceId, req.params.teamId, platform, metric); }));
});
r.post(`${W}/teams/:teamId/metrics`, requireRole("editor"), (req, res) => ok(res, recordObservation({ ...req.body, workspace_id: req.workspaceId, team_id: req.params.teamId })));

// ---- ask this team (retrieval + citations; no model => extractive answer) ---
r.post(`${W}/teams/:teamId/ask`, requireRole("viewer"), async (req, res) => {
  const question = String(req.body?.question || "").trim(); if (!question) return bad(res, "question_required");
  const terms = question.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  const claims = rows(q("SELECT * FROM claims WHERE workspace_id=? AND team_id=? AND review_state != 'archived'", [req.workspaceId, req.params.teamId]));
  const ev = evidenceForTeam(req.workspaceId, req.params.teamId, { includeConfidential: isEditor(req) });
  const score = (t) => terms.reduce((a, w) => a + (t.toLowerCase().includes(w) ? 1 : 0), 0);
  const hits = claims.map((c) => ({ c, s: score(`${c.headline} ${c.statement} ${c.alternatives}`) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 5);
  const evHits = ev.map((e) => ({ e, s: score(`${e.excerpt} ${e.topic || ""} ${e.source_title || ""}`) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6);
  if (!hits.length && !evHits.length) return ok(res, { answer: "I don't know from the evidence in this workspace. No claims or evidence match the question.", citations: [], suggest_run: true, question });
  let answer;
  if (llmStatus().configured) {
    try {
      const { structured, untrusted } = await import("../engine/llm.js");
      const schema = { type: "object", additionalProperties: false, required: ["answer", "cited_ids", "unknowns"], properties: { answer: { type: "string" }, cited_ids: { type: "array", items: { type: "string" } }, unknowns: { type: "string" } } };
      const user = [`Question: ${question}`, `Claims:`, ...hits.map(({ c }) => `${c.id} [${c.label}/${c.confidence}] ${c.statement}`), `Evidence:`, ...evHits.map(({ e }) => untrusted(e.id, `${e.excerpt} (source: ${e.source_title || e.locator || e.url})`, 800))].join("\n");
      const out = await structured({ system: "Answer only from the provided claims and evidence. Cite IDs. Say what you do not know.", user, schema, name: "answer", maxTokens: 1200 });
      answer = `${out.output.answer}${out.output.unknowns ? `\n\nUnknown: ${out.output.unknowns}` : ""}`;
    } catch (e) { answer = null; }
  }
  if (!answer) answer = `Extractive answer (no model configured). Most relevant claims:\n` + hits.map(({ c }) => `• [${c.label}, confidence ${c.confidence}] ${c.statement}`).join("\n") + (evHits.length ? `\n\nRelevant evidence:\n` + evHits.map(({ e }) => `• "${e.excerpt.slice(0, 200)}" — ${e.source_title || e.locator || e.url}`).join("\n") : "") + `\n\nWhat this does not answer: anything outside these records. Consider a scoped research run.`;
  ok(res, { answer, citations: [...hits.map(({ c }) => ({ type: "claim", id: c.id, label: c.headline || c.statement.slice(0, 80) })), ...evHits.map(({ e }) => ({ type: "evidence", id: e.id, label: e.source_title || e.locator || e.url, excerpt: e.excerpt }))], suggest_run: hits.length < 2, question });
});

// ---- across teams ----------------------------------------------------------
r.get(`${W}/compare`, requireRole("viewer"), (req, res) => {
  const ids = String(req.query.teams || "").split(",").filter(Boolean);
  const out = ids.map((tid) => {
    const team = row(one("SELECT * FROM teams WHERE id=?", [tid]));
    const codes = q("SELECT ec.node_id, COUNT(*) AS n FROM evidence_codes ec JOIN claims c ON c.id=ec.target_id AND ec.target_type='claim' WHERE c.workspace_id=? AND c.team_id=? GROUP BY ec.node_id", [req.workspaceId, tid]);
    const claims = rows(q("SELECT id, headline, statement, label, confidence, section FROM claims WHERE workspace_id=? AND team_id=? AND review_state != 'archived' ORDER BY prominence DESC LIMIT 40", [req.workspaceId, tid]));
    const opps = listEntities(req.workspaceId, "opportunity", { team_id: tid }).map((o) => ({ id: o.id, title: o.title, exclusive: o.data.exclusive_to_team ?? null, name_swap: o.data.name_swap_test }));
    return { team, codes: Object.fromEntries(codes.map((c) => [c.node_id, c.n])), claims, opportunities: opps };
  });
  const nodes = rows(q("SELECT id, name, layer FROM taxonomy_nodes WHERE version=?", [currentTaxVersion()]));
  ok(res, { teams: out, nodes });
});

// ---- exports (authorization enforced; confidential excluded for viewers) -----
r.get(`${W}/teams/:teamId/export/:kind`, requireRole("viewer"), (req, res) => {
  const { kind } = req.params; const w = req.workspaceId; const teamId = req.params.teamId;
  const team = row(one("SELECT * FROM teams WHERE id=?", [teamId]));
  const ws = row(one("SELECT * FROM workspaces WHERE id=?", [w]));
  const base = { exported_at: now(), exported_by: req.user.email, workspace: { id: ws.id, kind: ws.kind, note: ws.kind === "demo" ? "DEMO WORKSPACE — synthetic fixtures" : null }, team: { id: team.id, name: team.name, league: team.league_id }, taxonomy_version: currentTaxVersion(), includes_confidential: isEditor(req) };
  if (kind === "dossier") {
    const claims = rows(q("SELECT id FROM claims WHERE workspace_id=? AND team_id=? AND review_state != 'archived'", [w, teamId])).map((c) => getClaim(c.id, { includeConfidential: isEditor(req) }));
    return ok(res, { ...base, kind, claims, profiles: listEntities(w, "fan_profile", { team_id: teamId }), growth: listEntities(w, "growth_hypothesis", { team_id: teamId }), communities: listEntities(w, "fan_community", { team_id: teamId }) });
  }
  if (kind === "calendar") return ok(res, { ...base, kind, moments: listEntities(w, "moment", { team_id: teamId }).map((m) => ({ id: m.id, title: m.title, date: m.starts_at, date_kind: m.data.date_kind, lane: m.data.lane, recurrence: m.data.recurrence, uncertainty: m.data.uncertainty || null, claim_ids: m.data.claim_ids })), milestones: ws.settings.product_milestones || [] });
  if (kind === "briefs") {
    const opps = listEntities(w, "opportunity", { team_id: teamId }).filter((o) => !o.confidential || isEditor(req));
    return ok(res, { ...base, kind, territories: opps.map((o) => ({ ...o, versions: listEntities(w, "brief_version", { parent_id: o.id }), decisions: listEntities(w, "decision", { parent_id: o.id }), supporting: (o.data.supporting_claim_ids || []).map((id) => getClaim(id, { includeConfidential: isEditor(req) })).filter(Boolean), conflicting: (o.data.conflicting_claim_ids || []).map((id) => getClaim(id, { includeConfidential: isEditor(req) })).filter(Boolean) })) });
  }
  bad(res, "bad_kind");
});

// ---- saved views / research requests ---------------------------------------
r.get(`${W}/me/saved`, requireRole("viewer"), (req, res) => ok(res, rows(q("SELECT team_id, saved_by FROM team_state WHERE workspace_id=?", [req.workspaceId])).filter((t) => (t.saved_by || []).includes(req.user.id)).map((t) => t.team_id)));

export default r;
