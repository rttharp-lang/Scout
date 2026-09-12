// Evidence contract helpers: source families and duplicate detection so ten
// reposts never count as ten corroborating sources; deterministic confidence
// rationale from independence, locality, recency, coverage and contradiction.
import crypto from "node:crypto";
import { q, one, run, rows, row, now, uid, J } from "../db.js";

export function normalizeText(t) { return String(t || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\w ]/g, "").trim(); }
export function contentHash(text) { return crypto.createHash("sha256").update(normalizeText(text).slice(0, 4000)).digest("hex"); }
// Shingle similarity for near-duplicate (syndicated) detection.
export function similarity(a, b) {
  const sh = (t) => { const w = normalizeText(t).split(" "); const s = new Set(); for (let i = 0; i + 4 <= w.length; i++) s.add(w.slice(i, i + 4).join(" ")); return s; };
  const A = sh(a), B = sh(b); if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / Math.min(A.size, B.size);
}

export function upsertSource(s) {
  const hash = s.content_hash || contentHash(s.text || s.title || s.url || "");
  const existing = s.url ? one("SELECT * FROM sources WHERE workspace_id=? AND url=?", [s.workspace_id, s.url]) : null;
  if (existing) return { source: row(existing), created: false, is_duplicate: Boolean(existing.is_duplicate) };
  let family_id = null, is_duplicate = 0;
  const sameHash = one("SELECT * FROM sources WHERE workspace_id=? AND content_hash=?", [s.workspace_id, hash]);
  if (sameHash) { family_id = sameHash.family_id || sameHash.id; is_duplicate = 1; }
  else if (s.text) {
    const candidates = q("SELECT id, family_id, data FROM sources WHERE workspace_id=? AND team_id IS ? ORDER BY created_at DESC LIMIT 200", [s.workspace_id, s.team_id || null]);
    for (const c of candidates) {
      const ct = (() => { try { return JSON.parse(c.data).text || ""; } catch { return ""; } })();
      if (ct && similarity(ct, s.text) > 0.6) { family_id = c.family_id || c.id; is_duplicate = 1; break; }
    }
  }
  const id = uid("src");
  run(`INSERT INTO sources(id,workspace_id,team_id,url,locator,title,source_type,origin,publisher,author,published_at,event_at,retrieved_at,tz,language,family_id,content_hash,is_duplicate,access,retention,connector_id,confidential,data,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, s.workspace_id, s.team_id || null, s.url || null, s.locator || null, s.title || null, s.source_type || "web", s.origin || "unknown",
     s.publisher || null, s.author || null, s.published_at || null, s.event_at || null, s.retrieved_at || now(), s.tz || null, s.language || "en",
     family_id || id, hash, is_duplicate, J(s.access || {}), J(s.retention || {}), s.connector_id || null, s.confidential ? 1 : 0,
     J({ text: s.text ? String(s.text).slice(0, 30000) : undefined, ...(s.data || {}) }), now()]);
  return { source: row(one("SELECT * FROM sources WHERE id=?", [id])), created: true, is_duplicate: Boolean(is_duplicate) };
}

export function addEvidence(e) {
  const id = uid("ev");
  run(`INSERT INTO evidence(id,workspace_id,team_id,source_id,excerpt,position,place,topic,language,local_relevance_reason,geo_relevance,evidence_mode,engagement,taxonomy_version,community_id,validation_status,alternatives,confidential,run_id,task_id,data,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, e.workspace_id, e.team_id || null, e.source_id, String(e.excerpt).slice(0, 1200), e.position || null, e.place || null, e.topic || null, e.language || "en",
     e.local_relevance_reason || null, e.geo_relevance || "unknown", e.evidence_mode || "interpretation", e.engagement ? J(e.engagement) : null,
     e.taxonomy_version ?? null, e.community_id || null, e.validation_status || "unvalidated", J(e.alternatives || []), e.confidential ? 1 : 0,
     e.run_id || null, e.task_id || null, J(e.data || {}), now()]);
  for (const nodeId of e.codes || []) codeTarget({ workspace_id: e.workspace_id, target_type: "evidence", target_id: id, node_id: nodeId, taxonomy_version: e.taxonomy_version, coder: e.coder || "agent", coder_kind: e.coder_kind || "agent" });
  return row(one("SELECT * FROM evidence WHERE id=?", [id]));
}
export function codeTarget(c) {
  run("INSERT INTO evidence_codes(id,workspace_id,target_type,target_id,node_id,taxonomy_version,coder,coder_kind,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    [uid("code"), c.workspace_id, c.target_type, c.target_id, c.node_id, c.taxonomy_version || 1, c.coder || "agent", c.coder_kind || "agent", c.note || null, now()]);
}
export function codesFor(target_type, target_id) { return rows(q("SELECT * FROM evidence_codes WHERE target_type=? AND target_id=?", [target_type, target_id])); }

export function upsertClaim(c) {
  const id = c.id || uid("clm");
  const t = now();
  const existing = c.id ? one("SELECT * FROM claims WHERE id=?", [c.id]) : null;
  if (existing) {
    run(`UPDATE claims SET statement=?, label=?, confidence=?, confidence_rationale=?, headline=?, section=?, prominence=?, alternatives=?, disconfirming=?, version=version+1, data=?, updated_at=? WHERE id=?`,
      [c.statement ?? existing.statement, c.label ?? existing.label, c.confidence ?? existing.confidence, J(c.confidence_rationale ?? JSON.parse(existing.confidence_rationale)), c.headline ?? existing.headline,
       c.section ?? existing.section, c.prominence ?? existing.prominence, J(c.alternatives ?? JSON.parse(existing.alternatives)), c.disconfirming ?? existing.disconfirming, J({ ...JSON.parse(existing.data), ...(c.data || {}) }), t, id]);
  } else {
    run(`INSERT INTO claims(id,workspace_id,team_id,statement,label,confidence,confidence_rationale,review_state,headline,section,prominence,alternatives,disconfirming,taxonomy_version,run_id,version,created_by,data,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, c.workspace_id, c.team_id, c.statement, c.label || "hypothesis", c.confidence || "low", J(c.confidence_rationale || {}), c.review_state || "draft", c.headline || null, c.section || null,
       c.prominence ?? 1, J(c.alternatives || []), c.disconfirming || null, c.taxonomy_version ?? 1, c.run_id || null, 1, c.created_by || null, J(c.data || {}), t, t]);
  }
  for (const ev of c.evidence || []) run("INSERT OR REPLACE INTO claim_evidence(claim_id,evidence_id,stance,explanation) VALUES(?,?,?,?)", [id, ev.evidence_id, ev.stance || "supports", ev.explanation || null]);
  for (const nodeId of c.codes || []) codeTarget({ workspace_id: c.workspace_id, target_type: "claim", target_id: id, node_id: nodeId, taxonomy_version: c.taxonomy_version, coder: c.coder || "agent", coder_kind: c.coder_kind || "agent" });
  // Recompute stored confidence from linked evidence so the label is never decorative.
  const full = getClaim(id);
  run("UPDATE claims SET confidence=?, confidence_rationale=? WHERE id=?", [full.confidence_computed.level, J(full.confidence_computed), id]);
  return getClaim(id);
}
export function getClaim(id, { includeConfidential = true } = {}) {
  const c = row(one("SELECT * FROM claims WHERE id=?", [id]));
  if (!c) return null;
  c.evidence = rows(q(`SELECT ce.stance, ce.explanation, e.*, s.url, s.title AS source_title, s.source_type, s.origin, s.publisher, s.published_at, s.family_id, s.is_duplicate, s.locator, s.confidential AS source_confidential
                       FROM claim_evidence ce JOIN evidence e ON e.id=ce.evidence_id JOIN sources s ON s.id=e.source_id WHERE ce.claim_id=? ${includeConfidential ? "" : "AND e.confidential=0 AND s.confidential=0"}`, [id]));
  c.codes = codesFor("claim", id);
  c.confidence_computed = computeConfidence(c);
  return c;
}

// Deterministic, explainable confidence. Each factor is reported; no decorative score.
export function computeConfidence(claim) {
  const ev = claim.evidence || [];
  const supports = ev.filter((e) => e.stance === "supports");
  const contradicts = ev.filter((e) => e.stance === "contradicts");
  const families = new Set(supports.map((e) => e.family_id || e.source_id));
  const origins = new Set(supports.map((e) => e.origin));
  const fanOriginated = supports.some((e) => e.origin === "fan");
  const local = supports.filter((e) => e.geo_relevance === "verified").length;
  const recent = supports.filter((e) => e.published_at && Date.now() - Date.parse(e.published_at) < 2 * 365 * 864e5).length;
  const behavior = supports.filter((e) => e.evidence_mode === "behavior" || e.evidence_mode === "testimony").length;
  const factors = {
    independence: families.size >= 3 ? "high" : families.size === 2 ? "medium" : "low",
    independent_source_families: families.size, origins: [...origins], fan_originated: fanOriginated,
    locality: local >= 2 ? "high" : local === 1 ? "medium" : "low", locally_verified_items: local,
    recency: recent >= 2 ? "high" : recent === 1 ? "medium" : "low", recent_items: recent,
    coverage: behavior >= 2 ? "high" : behavior === 1 ? "medium" : "low", behavior_or_testimony_items: behavior,
    contradiction: contradicts.length ? `${contradicts.length} contradicting item(s) recorded` : "none recorded",
  };
  let score = 0;
  for (const k of ["independence", "locality", "recency", "coverage"]) score += factors[k] === "high" ? 2 : factors[k] === "medium" ? 1 : 0;
  if (contradicts.length) score -= Math.min(3, contradicts.length);
  if (!fanOriginated) score -= 1;
  let level = claim.label === "proposal" ? "n/a" : score >= 6 ? "high" : score >= 3 ? "medium" : "low";
  if (level === "high" && contradicts.length) level = "medium"; // recorded contradictions always cap confidence
  const summary = level === "n/a" ? "Creative proposal; confidence does not apply." :
    `${level}: ${families.size} independent source famil${families.size === 1 ? "y" : "ies"}${fanOriginated ? " incl. fan-originated" : ", no fan-originated perspective yet"}; locality ${factors.locality}; recency ${factors.recency}; ${factors.contradiction}.`;
  return { level, factors, summary };
}

export function evidenceForTeam(workspace_id, team_id, { includeConfidential = false, limit = 500 } = {}) {
  return rows(q(`SELECT e.*, s.url, s.title AS source_title, s.source_type, s.origin, s.publisher, s.published_at, s.family_id, s.is_duplicate, s.locator, s.retrieved_at AS source_retrieved_at
                 FROM evidence e JOIN sources s ON s.id=e.source_id WHERE e.workspace_id=? AND e.team_id=? ${includeConfidential ? "" : "AND e.confidential=0 AND s.confidential=0"} ORDER BY e.created_at DESC LIMIT ?`, [workspace_id, team_id, limit]));
}
