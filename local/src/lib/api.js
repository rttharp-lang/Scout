// Thin fetch wrapper. Sessions are httpOnly cookies set by the server.
async function call(method, path, body) {
  const res = await fetch(`/api${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) { const e = new Error(data?.error || `HTTP ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}
export const api = { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b || {}), patch: (p, b) => call("PATCH", p, b || {}), del: (p) => call("DELETE", p) };
export const fmtDate = (s) => { if (!s) return "unknown date"; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
export const fmtTime = (s) => { if (!s) return ""; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString(); };
export const teamInk = (hex) => { const h = (hex || "#000").replace("#", ""); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 160 ? "#0b0b0b" : "#ffffff"; };
export const teamStyle = (team) => team ? { "--team": team.colors?.[0] || "#0b0b0b", "--team-2": team.colors?.[1] || "#333", "--team-ink": teamInk(team.colors?.[0]) } : {};
