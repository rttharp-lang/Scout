// What the landing page shows, picked from whatever the registries have loaded so far.

/**
 * The hero's cycle: the coach's current effect, then the headline looks, then the rest.
 * Renders run in this order, so the cheap looks come right after the first one (the strip
 * fills fast) and the heavy ones (chrome, chenille, neon ≈ 260–460 ms each) go last.
 * Backdrops alternate (mid → paper → mid → dark → team → dark) so each wipe reads.
 */
export const HERO_LOOKS = ["graffiti", "risograph", "halftone", "chrome", "chenille", "neon"];
export const HERO_GARMENTS = ["hoodie", "tee", "jersey", "longsleeve", "shorts", "pants"];

/** Remixes only (no "Clean" pass-through), in gallery order. */
export const remixes = (effects) => (effects || []).filter((e) => e.id !== "original");

export function pickCycle(effects, currentId, max = 6) {
  const pool = remixes(effects);
  const out = [];
  const add = (e) => { if (e && !out.includes(e) && out.length < max) out.push(e); };
  add(pool.find((e) => e.id === currentId));
  for (const id of HERO_LOOKS) add(pool.find((e) => e.id === id));
  for (const e of pool) add(e);
  return out;
}

const hasEffect = (item) => !!item && ["front", "back"].some((v) => (item[v] || []).some((p) => p.source === "effect"));

/** The garment that wears the look in the hero: a loaded, enabled piece with an effect graphic. */
export function pickHeroGarment(garments, collection) {
  const items = collection?.items || {};
  const loaded = garments || [];
  for (const id of HERO_GARMENTS) {
    const g = loaded.find((x) => x.id === id);
    const it = items[id];
    if (g && it && it.enabled !== false && hasEffect(it)) return g;
  }
  return loaded.find((g) => items[g.id] && hasEffect(items[g.id])) || loaded.find((g) => items[g.id]) || null;
}

/** The look the collection wears: the coach's effect if loaded, else the first remix. */
export function currentLook(effects, effectState) {
  const pool = remixes(effects);
  const hit = (effects || []).find((e) => e.id === effectState?.id);
  const effect = hit || pool[0] || (effects || [])[0] || null;
  const own = effect && effect.id === effectState?.id;
  return { effect, params: own ? effectState.params || {} : {}, seed: effectState?.seed ?? 7 };
}

/** Garments of the current collection that loaded and are switched on, in collection order. */
export function collectionGarments(garments, collection) {
  const items = collection?.items || {};
  return (garments || []).filter((g) => items[g.id] && items[g.id].enabled !== false);
}
