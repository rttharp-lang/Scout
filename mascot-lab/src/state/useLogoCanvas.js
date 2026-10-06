// Mascot Lab — the decoded logo as a canvas, shared by every consumer.
//
// useLogoCanvas() decodes state.logo.src with prepareLogo() (background removal
// per logo.bgRemoved: "auto" | true | false, at logo.tolerance), memoized by
// logo.key in a small module-level cache so the gallery, studio and collection
// all share one decode. While a new key decodes, the previous canvas is kept (with
// its own `key`) so the UI doesn't flash empty — always render with the returned
// `key`, not state.logo.key, when you feed render caches.
import { useEffect, useState } from "react";
import { prepareLogo } from "../engine/image.js";
import { useStore } from "./store.jsx";

const MAX_ENTRIES = 4;
const cache = new Map(); // key → Promise<{ canvas, info }>
const settled = new Map(); // key → { canvas, info } once resolved

function remember(key, promise) {
  cache.set(key, promise);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
    settled.delete(oldest);
  }
}

/** getLogoCanvas(logo) → Promise<{ canvas, info: { bgRemoved, hadAlpha, width, height } }> (memoized by logo.key). */
export function getLogoCanvas(logo) {
  if (!logo?.src) return Promise.reject(new Error("No logo yet."));
  const key = logo.key;
  if (cache.has(key)) {
    // refresh LRU position
    const p = cache.get(key);
    cache.delete(key);
    cache.set(key, p);
    return p;
  }
  const removeBg = logo.bgRemoved === true || logo.bgRemoved === false ? logo.bgRemoved : "auto";
  const p = prepareLogo(logo.src, { removeBg, tolerance: Number(logo.tolerance) || 28 }).then(
    (r) => {
      const out = { canvas: r.canvas, info: { bgRemoved: r.bgRemoved, hadAlpha: r.hadAlpha, width: r.width, height: r.height } };
      settled.set(key, out);
      return out;
    },
    (err) => {
      cache.delete(key); // allow a retry
      throw err instanceof Error ? err : new Error(String(err));
    },
  );
  remember(key, p);
  return p;
}

const IDLE = { canvas: null, key: null, status: "idle", error: null, info: null };

/**
 * useLogoCanvas() → { canvas, key, status: "idle" | "loading" | "ready" | "error", error, info }.
 * `canvas`/`key` may be the previous logo's while status is "loading".
 */
export function useLogoCanvas() {
  const { state } = useStore();
  const { logo } = state;
  const [res, setRes] = useState(() => {
    const hit = settled.get(logo.key);
    return hit ? { canvas: hit.canvas, key: logo.key, status: "ready", error: null, info: hit.info } : IDLE;
  });

  useEffect(() => {
    let alive = true;
    const hit = settled.get(logo.key);
    if (hit) {
      setRes((r) => (r.key === logo.key && r.status === "ready" ? r : { canvas: hit.canvas, key: logo.key, status: "ready", error: null, info: hit.info }));
      return;
    }
    setRes((r) => ({ ...r, status: "loading", error: null }));
    getLogoCanvas(logo).then(
      (out) => alive && setRes({ canvas: out.canvas, key: logo.key, status: "ready", error: null, info: out.info }),
      (error) => alive && setRes((r) => ({ ...r, status: "error", error })),
    );
    return () => { alive = false; };
    // logo.key captures src + bg setting + tolerance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logo.key]);

  return res;
}
