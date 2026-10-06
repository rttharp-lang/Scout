// Mascot Lab — localStorage, defensively. Storage can throw (sandboxed frames,
// private windows, blocked site data) or come back empty; the app must work either
// way, so every call is wrapped and failures are reported as values, not thrown.

function store() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** load(key, fallback = null) → parsed JSON value, or `fallback` when absent/unreadable. */
export function load(key, fallback = null) {
  try {
    const s = store();
    if (!s) return fallback;
    const raw = s.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * save(key, value) → { ok: true, bytes } | { ok: false, reason: "unavailable" | "quota" | "error", error }.
 * `bytes` is the stored string length (UTF-16 code units, what quotas count).
 */
export function save(key, value) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    return { ok: false, reason: "error", error };
  }
  const s = store();
  if (!s) return { ok: false, reason: "unavailable" };
  try {
    s.setItem(key, text);
    return { ok: true, bytes: text.length };
  } catch (error) {
    const quota =
      error && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22 || error.code === 1014);
    return { ok: false, reason: quota ? "quota" : "error", error };
  }
}

/** remove(key) → boolean (true when the key is gone afterwards). */
export function remove(key) {
  try {
    const s = store();
    if (!s) return false;
    s.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** available() → true when localStorage can actually be written. */
export function available() {
  const probe = "mascot-lab:probe";
  try {
    const s = store();
    if (!s) return false;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
