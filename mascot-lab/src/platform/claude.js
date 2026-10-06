// Mascot Lab — claude.ai Artifact runtime capabilities.
//
// When the site is published as a claude.ai Artifact, `window.claude.use(name)`
// resolves a capability namespace (or null when this view can't run it). Outside
// that runtime there is no `window.claude` at all. Everything here is safe to
// call anywhere: it never throws and resolves null whenever the capability is not
// available, so callers just branch on null and design for absence.

const memo = new Map();
const USE_TIMEOUT_MS = 12000; // the host itself answers null after 10 s

/** True when the page is running inside the claude.ai Artifact runtime. */
export function inArtifactRuntime() {
  try {
    return typeof window !== "undefined" && !!window.claude && typeof window.claude.use === "function";
  } catch {
    return false;
  }
}

/**
 * getCapability(name) → Promise<namespace | null>. Memoized per name (one
 * `use()` call per page load); never rejects.
 */
export function getCapability(name) {
  if (memo.has(name)) return memo.get(name);
  const p = (async () => {
    if (!inArtifactRuntime()) return null;
    try {
      const pending = Promise.resolve(window.claude.use(name));
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), USE_TIMEOUT_MS));
      const ns = await Promise.race([pending, timeout]);
      return ns ?? null;
    } catch {
      return null;
    }
  })();
  memo.set(name, p);
  return p;
}

/** Warm the memo early (e.g. at startup) so a later click doesn't wait on the host. */
export function prefetchCapabilities(names = ["downloads"]) {
  if (!inArtifactRuntime()) return;
  for (const n of names) getCapability(n);
}

/** Test helper: forget memoized results. */
export function resetCapabilities() {
  memo.clear();
}
