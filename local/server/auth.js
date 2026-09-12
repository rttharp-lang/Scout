// Server-side sessions (httpOnly cookie) + scrypt password hashing + workspace
// role checks. No security depends on the browser or a hidden URL.
import crypto from "node:crypto";
import { one, run, row, now, uid, audit } from "./db.js";

const SESSION_DAYS = 14;
const COOKIE = "local_session";

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `scrypt$${salt}$${h}`;
}
export function verifyPassword(pw, stored) {
  const [, salt, h] = String(stored).split("$");
  if (!salt || !h) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const ref = Buffer.from(h, "hex");
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}

export function createUser({ email, name, password, is_platform_admin = 0 }) {
  const id = uid("usr");
  run("INSERT INTO users(id,email,name,password_hash,is_platform_admin,created_at) VALUES(?,?,?,?,?,?)",
    [id, email.toLowerCase().trim(), name, hashPassword(password), is_platform_admin ? 1 : 0, now()]);
  return getUser(id);
}
export function getUser(id) {
  const u = one("SELECT id,email,name,is_platform_admin,created_at FROM users WHERE id=?", [id]);
  return u ? row(u) : null;
}
export function findUserByEmail(email) {
  return one("SELECT * FROM users WHERE email=?", [String(email).toLowerCase().trim()]);
}

export function createSession(user_id) {
  const id = crypto.randomBytes(32).toString("base64url");
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  run("INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)", [id, user_id, exp, now()]);
  return { id, expires_at: exp };
}
export function destroySession(id) { run("DELETE FROM sessions WHERE id=?", [id]); }

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function setSessionCookie(res, session, req = null) {
  // Secure only when the request actually arrived over HTTPS (directly or via a trusted proxy), or when forced.
  const https = req && (req.secure || req.headers["x-forwarded-proto"] === "https");
  const secure = https || process.env.LOCAL_COOKIE_SECURE === "true" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${session.id}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(session.expires_at).toUTCString()}${secure}`);
}
export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// Express middleware: attaches req.user (or null) from the session cookie.
export function sessionMiddleware(req, res, next) {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  req.sessionId = sid || null;
  req.user = null;
  if (sid) {
    const s = one("SELECT * FROM sessions WHERE id=?", [sid]);
    if (s && s.expires_at > now()) req.user = getUser(s.user_id);
    else if (s) destroySession(sid);
  }
  next();
}

export const ROLE_RANK = { viewer: 1, editor: 2, admin: 3 };
export function membership(user_id, workspace_id) {
  return one("SELECT * FROM memberships WHERE user_id=? AND workspace_id=?", [user_id, workspace_id]);
}
export function roleFor(user, workspace_id) {
  if (!user) return null;
  const m = membership(user.id, workspace_id);
  if (m) return m.role;
  return user.is_platform_admin ? "admin" : null;
}
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "auth_required" });
  next();
}
// Workspace authorization. Reads :workspaceId param (or body/query) and enforces minimum role.
export function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "auth_required" });
    const wid = req.params.workspaceId || req.body?.workspace_id || req.query?.workspace_id;
    if (!wid) return res.status(400).json({ error: "workspace_required" });
    const role = roleFor(req.user, wid);
    if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
      audit({ workspace_id: wid, user_id: req.user.id, action: "authz.denied", detail: { path: req.path, minRole } });
      return res.status(403).json({ error: "forbidden", required: minRole });
    }
    req.workspaceId = wid;
    req.role = role;
    next();
  };
}
