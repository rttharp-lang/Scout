// Durable SQLite persistence via node:sqlite (Node 22+). One connection per
// process; WAL mode so the background job runner and HTTP handlers coexist.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.LOCAL_DB_PATH || path.join(here, "..", "data", "local.db");

let db;
export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(fs.readFileSync(path.join(here, "schema.sql"), "utf8"));
  return db;
}
export function openTestDb() {
  db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(here, "schema.sql"), "utf8"));
  return db;
}

export const now = () => new Date().toISOString();
export const uid = (prefix = "id") => `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
export const J = (v) => JSON.stringify(v ?? null);
export const P = (s, fallback = null) => { try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; } };

export function q(sql, params = []) { return getDb().prepare(sql).all(...params); }
export function one(sql, params = []) { return getDb().prepare(sql).get(...params) || null; }
export function run(sql, params = []) { return getDb().prepare(sql).run(...params); }
export function tx(fn) {
  const d = getDb();
  d.exec("BEGIN");
  try { const r = fn(); d.exec("COMMIT"); return r; } catch (e) { d.exec("ROLLBACK"); throw e; }
}

// Parse the JSON columns of a row in one go.
const JSON_COLS = new Set(["data", "settings", "colors", "history", "registry", "search_terms", "calendar", "milestones",
  "access", "retention", "alternatives", "confidence_rationale", "scope", "budget", "spent", "plan", "summary", "model_info",
  "input", "output", "tools_used", "unresolved", "cost", "capabilities", "config", "detail", "migrations", "synonyms",
  "examples", "counterexamples", "payload", "coverage", "saved_by", "engagement"]);
export function row(r) {
  if (!r) return null;
  const out = {};
  for (const k of Object.keys(r)) out[k] = JSON_COLS.has(k) && typeof r[k] === "string" ? P(r[k], r[k]) : r[k];
  return out;
}
export const rows = (rs) => rs.map(row);

export function audit({ workspace_id = null, user_id = null, action, target_type = null, target_id = null, detail = {} }) {
  run("INSERT INTO audit_events(workspace_id,user_id,action,target_type,target_id,detail,created_at) VALUES(?,?,?,?,?,?,?)",
    [workspace_id, user_id, action, target_type, target_id, J(detail), now()]);
}

// Generic entity helpers -------------------------------------------------
export function insertEntity(e) {
  const id = e.id || uid(e.entity_type.slice(0, 4));
  const t = now();
  run(`INSERT INTO entities(id,entity_type,workspace_id,team_id,title,status,parent_id,version,taxonomy_version,confidential,created_by,run_id,starts_at,ends_at,data,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, e.entity_type, e.workspace_id, e.team_id || null, e.title || null, e.status || "draft", e.parent_id || null,
     e.version || 1, e.taxonomy_version ?? null, e.confidential ? 1 : 0, e.created_by || null, e.run_id || null,
     e.starts_at || null, e.ends_at || null, J(e.data || {}), t, t]);
  return getEntity(id);
}
export function updateEntity(id, patch) {
  const cur = getEntity(id);
  if (!cur) return null;
  const data = patch.data ? { ...cur.data, ...patch.data } : cur.data;
  run(`UPDATE entities SET title=?, status=?, parent_id=?, version=?, taxonomy_version=?, confidential=?, starts_at=?, ends_at=?, data=?, updated_at=? WHERE id=?`,
    [patch.title ?? cur.title, patch.status ?? cur.status, patch.parent_id ?? cur.parent_id, patch.version ?? cur.version,
     patch.taxonomy_version ?? cur.taxonomy_version, (patch.confidential ?? cur.confidential) ? 1 : 0,
     patch.starts_at ?? cur.starts_at, patch.ends_at ?? cur.ends_at, J(data), now(), id]);
  return getEntity(id);
}
export function getEntity(id) { return row(one("SELECT * FROM entities WHERE id=?", [id])); }
export function listEntities(workspace_id, entity_type, { team_id, status, parent_id, limit = 500 } = {}) {
  let sql = "SELECT * FROM entities WHERE workspace_id=? AND entity_type=?";
  const params = [workspace_id, entity_type];
  if (team_id) { sql += " AND team_id=?"; params.push(team_id); }
  if (status) { sql += " AND status=?"; params.push(status); }
  if (parent_id) { sql += " AND parent_id=?"; params.push(parent_id); }
  sql += " ORDER BY created_at DESC LIMIT ?"; params.push(limit);
  return rows(q(sql, params));
}
export function link(from_type, from_id, to_type, to_id, relation, data = {}) {
  run("INSERT OR IGNORE INTO links(from_type,from_id,to_type,to_id,relation,data,created_at) VALUES(?,?,?,?,?,?,?)",
    [from_type, from_id, to_type, to_id, relation, J(data), now()]);
}
export function linksFrom(from_type, from_id, relation) {
  const sql = "SELECT * FROM links WHERE from_type=? AND from_id=?" + (relation ? " AND relation=?" : "");
  return rows(q(sql, relation ? [from_type, from_id, relation] : [from_type, from_id]));
}
export function linksTo(to_type, to_id, relation) {
  const sql = "SELECT * FROM links WHERE to_type=? AND to_id=?" + (relation ? " AND relation=?" : "");
  return rows(q(sql, relation ? [to_type, to_id, relation] : [to_type, to_id]));
}
