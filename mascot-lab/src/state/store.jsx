// Mascot Lab — app state: React context + useReducer, persisted to localStorage.
//
// Shape (CONTRACTS.md "App state", with the deviations noted ★):
//   team:       { school, mascot, isSample }
//   logo:       { src, name, bgRemoved, tolerance, key, sampleId? }
//               ★ `src` (URL or data URL) instead of `dataUrl`.
//               ★ `bgRemoved` is the background-removal SETTING: "auto" (remove only
//                 when the image has no transparency) | true (force) | false (keep).
//                 The actual outcome comes back from useLogoCanvas().info.bgRemoved.
//               `key` is derived (hash of src + bg setting + tolerance) — render caches
//               key on it. `sampleId` is set when the logo is one of SAMPLE_LOGOS.
//   palette:    { primary, secondary, accent, dark, light }  ("#RRGGBB" uppercase)
//   effect:     { id, params (overrides only), seed }
//   favorites:  [effectId]
//   collection: Collection (buildCollection) — items edited via updateItem get custom:true
//   roster:     [{ id, name, number, top, bottom, items: { [garmentId]: bool }, example? }]
//   extras:     { [garmentId]: { [size]: qty } }
//   contact:    { coach, email, phone, school, address, needBy, notes }
//   order:      { status: "draft" | "submitted", ref, channel, submittedAt }
//   flags:      { logoNotSaved }  ★ extra: true when the last visit's uploaded logo was too
//                                   big to persist and the sample is showing instead.
//
// useStore() → { state, dispatch, actions }.
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { DEFAULT_SAMPLE, SAMPLE_LOGOS } from "../assets/samples/index.js";
import { buildCollection } from "../apparel/collection.js";
import { availableEffectIds, getEffect, loadEffects } from "../engine/effects/index.js";
import { luminance } from "../engine/core.js";
import * as storage from "../platform/storage.js";

export const STORAGE_KEY = "mascot-lab:v1";
const VERSION = 1;
const SAVE_DEBOUNCE_MS = 450;
export const DEFAULT_EFFECT_ID = "graffiti";
export const DEFAULT_TOLERANCE = 28;
const ROLES = ["primary", "secondary", "accent", "dark", "light"];

/* ───────────────────────────── helpers ───────────────────────────── */

/** normHex("#abc" | "aabbcc") → "#AABBCC" or null. */
export function normHex(v) {
  if (typeof v !== "string") return null;
  let h = v.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(h) ? "#" + h.toUpperCase() : null;
}

/** FNV-1a 32-bit over the whole string → base36. Cheap enough for a 1–2 MB data URL. */
export function hashString(s) {
  let h = 0x811c9dc5;
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + str.length.toString(36);
}

export function logoKey(logo) {
  const bg = logo.bgRemoved === true ? "rm" : logo.bgRemoved === false ? "keep" : "auto";
  return `${hashString(logo.src)}-${bg}-${Number(logo.tolerance) || DEFAULT_TOLERANCE}`;
}

function normPalette(p, fallback = DEFAULT_SAMPLE.palette) {
  const out = {};
  for (const r of ROLES) out[r] = normHex(p?.[r]) || normHex(fallback[r]);
  return out;
}

const contrast = (a, b) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const inkOn = (hex) => (contrast(hex, "#FFFFFF") >= contrast(hex, "#0B0D10") ? "#FFFFFF" : "#0B0D10");

const THEME_BG = { light: "#ECEFF3", dark: "#0C0E12" };
const THEME_INK = { light: "#0E1116", dark: "#E8ECF1" };

/** The first team colour that reads (≥3:1) on the theme background, else the theme ink. */
function readableTeamColor(palette, theme) {
  const order = theme === "light" ? ["primary", "secondary", "dark", "accent"] : ["primary", "secondary", "accent", "light"];
  for (const r of order) if (contrast(palette[r], THEME_BG[theme]) >= 3) return palette[r];
  return THEME_INK[theme];
}

/** CIELAB distance — "visibly different colours" (hue counts, not just lightness). */
function lab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(lin);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
const deltaE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
function mixHex(a, b, t) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t);
  return "#" + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * flashTeamColor(palette, theme) → the team's "flash" for one theme: the trim line under
 * the primary in header/dialog stripes, the wordmark's misregistration offset, toast
 * edges. It must show on the theme background, stand apart from the ink (the wordmark
 * tag) and from the primary it sits under. First a team colour that already does
 * (secondary, then accent, light, dark); otherwise the team colour nudged lighter/darker
 * until it does (red + black on the light theme → a charcoal; on dark → a light grey).
 */
function flashTeamColor(p, theme = "light") {
  const bg = THEME_BG[theme], ink = THEME_INK[theme];
  const primaryShows = contrast(p.primary, bg) >= 1.5;
  const distinct = (c) => !primaryShows || deltaE(c, p.primary) >= 25;
  const fits = (c, min) => (contrast(c, bg) >= min || deltaE(c, bg) >= 45) && (contrast(c, ink) >= min - 0.2 || deltaE(c, ink) >= 45) && distinct(c);
  const roles = [p.secondary, p.accent, p.light, p.dark];
  const hit = roles.find((c) => fits(c, 1.6));
  if (hit) return hit;
  let best = null, bestVis = 0;
  for (const base of [p.secondary, p.accent, p.primary, p.light, p.dark]) {
    for (const toward of ["#FFFFFF", "#000000"]) {
      for (let t = 0.04; t <= 0.9; t += 0.04) {
        const c = mixHex(base, toward, t);
        if (contrast(c, bg) >= 2 && contrast(c, ink) >= 2 && distinct(c)) {
          const vis = contrast(c, bg);
          if (vis > bestVis) { best = c; bestVis = vis; }
          break;
        }
      }
    }
  }
  return best || (theme === "light" ? "#5C6470" : "#9BA4B0");
}

/** teamCssVars(palette) → { "--team-1": "#…", … } — what the store writes on <html>.
 *  (--team-flash itself comes from tokens.css: --team-flash-on-light / -on-dark by theme.) */
export function teamCssVars(palette) {
  const p = normPalette(palette);
  const onLight = readableTeamColor(p, "light");
  const onDark = readableTeamColor(p, "dark");
  return {
    "--team-1": p.primary,
    "--team-2": p.secondary,
    "--team-3": p.accent,
    "--team-dark": p.dark,
    "--team-light": p.light,
    "--team-1-ink": inkOn(p.primary),
    "--team-2-ink": inkOn(p.secondary),
    "--team-3-ink": inkOn(p.accent),
    "--team-on-light": onLight,
    "--team-on-light-ink": inkOn(onLight),
    "--team-on-dark": onDark,
    "--team-on-dark-ink": inkOn(onDark),
    // tokens.css points --team-flash at the one for the current theme
    "--team-flash-on-light": flashTeamColor(p, "light"),
    "--team-flash-on-dark": flashTeamColor(p, "dark"),
  };
}

/* ───────────────────────────── initial state ───────────────────────────── */

// Example roster — clearly flagged (example: true) so the Order page can label it
// and offer "clear examples". Realistic varsity mix of tops/bottoms.
const EXAMPLE_PLAYERS = [
  ["J. Carter", "0", "L", "L"],
  ["M. Alvarez", "1", "M", "M"],
  ["D. Okafor", "3", "XL", "XL"],
  ["T. Nguyen", "4", "S", "S"],
  ["K. Brooks", "5", "L", "M"],
  ["A. Patel", "10", "M", "M"],
  ["R. Johnson", "11", "2XL", "XL"],
  ["S. Kowalski", "13", "XL", "L"],
  ["L. Thompson", "21", "L", "L"],
  ["C. Ramirez", "23", "M", "S"],
  ["B. Haddad", "32", "2XL", "2XL"],
  ["E. Washington", "44", "3XL", "2XL"],
];

function exampleRoster(garmentIds) {
  return EXAMPLE_PLAYERS.map(([name, number, top, bottom], i) => ({
    id: `ex-${i + 1}`,
    name,
    number,
    top,
    bottom,
    items: Object.fromEntries(garmentIds.map((g) => [g, true])),
    example: true,
  }));
}

export const EMPTY_CONTACT = { coach: "", email: "", phone: "", school: "", address: "", needBy: "", notes: "" };
const DRAFT_ORDER = { status: "draft", ref: null, channel: null, submittedAt: null };

function sampleLogo(sample = DEFAULT_SAMPLE) {
  const logo = { src: sample.url, name: sample.name, bgRemoved: "auto", tolerance: DEFAULT_TOLERANCE, sampleId: sample.id };
  return { ...logo, key: logoKey(logo) };
}

export function createInitialState() {
  const palette = normPalette(DEFAULT_SAMPLE.palette);
  const collection = buildCollection("statement", palette);
  return {
    version: VERSION,
    team: { school: DEFAULT_SAMPLE.team.school, mascot: DEFAULT_SAMPLE.team.mascot, isSample: true },
    logo: sampleLogo(DEFAULT_SAMPLE),
    palette,
    effect: { id: DEFAULT_EFFECT_ID, params: {}, seed: 7 },
    favorites: [],
    collection,
    roster: exampleRoster(Object.keys(collection.items)),
    extras: {},
    contact: { ...EMPTY_CONTACT },
    order: { ...DRAFT_ORDER },
    flags: { logoNotSaved: false },
  };
}

/* ───────────────────────────── reducer ───────────────────────────── */

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** A stored/edited item is usable (else it's rebuilt from the recipe rather than crash a page). */
const validItem = (it) =>
  isObj(it) && isObj(it.colors) && Array.isArray(it.front) && Array.isArray(it.back) &&
  [...it.front, ...it.back].every(isObj) && (it.text == null || isObj(it.text));

/**
 * Rebuild a collection for a style/palette/effect stage, keeping per-item `enabled` and any
 * item the coach edited (if it's well-formed). `stage` defaults to the previous collection's
 * effectStage.
 */
function rebuildCollection(prev, styleId, palette, { keepCustom = true, stage } = {}) {
  const effectStage = stage === undefined ? prev?.effectStage : stage;
  const next = buildCollection(styleId, palette, { effectStage });
  const prevItems = prev?.items || {};
  for (const id of Object.keys(next.items)) {
    const old = prevItems[id];
    if (!old) continue;
    if (keepCustom && old.custom && prev.dropStyle === next.dropStyle && validItem(old)) next.items[id] = old;
    else next.items[id].enabled = old.enabled !== false;
  }
  return next;
}

function reducer(state, action) {
  switch (action.type) {
    case "setTeam":
      return { ...state, team: { ...state.team, ...action.team } };

    case "setLogo": {
      const patch = action.logo || {};
      const logo = { ...state.logo, ...patch };
      const srcChanged = "src" in patch && patch.src !== state.logo.src;
      if (srcChanged && !("sampleId" in patch)) delete logo.sampleId;
      if (!logo.sampleId) delete logo.sampleId;
      logo.tolerance = Number.isFinite(Number(logo.tolerance)) ? Number(logo.tolerance) : DEFAULT_TOLERANCE;
      if (![true, false, "auto"].includes(logo.bgRemoved)) logo.bgRemoved = "auto";
      logo.key = patch.key || logoKey(logo);
      const team = srcChanged ? { ...state.team, isSample: !!logo.sampleId } : state.team;
      const flags = srcChanged ? { ...state.flags, logoNotSaved: false } : state.flags;
      return { ...state, logo, team, flags };
    }

    case "loadSample": {
      const sample = SAMPLE_LOGOS.find((s) => s.id === action.id) || DEFAULT_SAMPLE;
      const palette = normPalette(sample.palette);
      return {
        ...state,
        logo: sampleLogo(sample),
        team: { school: sample.team.school, mascot: sample.team.mascot, isSample: true },
        palette,
        collection: rebuildCollection(state.collection, state.collection?.dropStyle || "statement", palette),
        flags: { ...state.flags, logoNotSaved: false },
      };
    }

    case "setPalette": {
      const palette = normPalette({ ...state.palette, ...action.palette }, state.palette);
      if (ROLES.every((r) => palette[r] === state.palette[r])) return state;
      return { ...state, palette, collection: rebuildCollection(state.collection, state.collection.dropStyle, palette) };
    }

    case "setEffect": {
      const { id, params, seed } = action;
      if (!id) return state;
      const sameId = id === state.effect.id;
      return {
        ...state,
        effect: {
          id,
          params: params !== undefined ? { ...params } : sameId ? state.effect.params : {},
          seed: Number.isFinite(seed) ? seed : state.effect.seed,
        },
      };
    }

    case "setEffectParams": {
      const params = action.params === null ? {} : { ...state.effect.params, ...action.params };
      for (const k of Object.keys(params)) if (params[k] === undefined) delete params[k];
      return { ...state, effect: { ...state.effect, params } };
    }

    case "setEffectSeed":
      return { ...state, effect: { ...state.effect, seed: action.seed >>> 0 } };

    case "toggleFavorite": {
      const has = state.favorites.includes(action.id);
      return { ...state, favorites: has ? state.favorites.filter((f) => f !== action.id) : [...state.favorites, action.id] };
    }

    case "setDropStyle":
      return { ...state, collection: rebuildCollection(state.collection, action.id, state.palette, { keepCustom: false }) };

    case "updateItem": {
      const prev = state.collection.items[action.garmentId];
      if (!prev) return state;
      const patch = typeof action.patch === "function" ? action.patch(prev) : action.patch;
      const item = {
        ...prev,
        ...patch,
        colors: patch?.colors ? { ...prev.colors, ...patch.colors } : prev.colors,
        custom: patch && Object.keys(patch).some((k) => k !== "enabled") ? true : prev.custom,
      };
      if (!item.custom) delete item.custom;
      return { ...state, collection: { ...state.collection, items: { ...state.collection.items, [action.garmentId]: item } } };
    }

    case "setCollection": {
      // pieces the coach never edited are a pure function of (drop style, palette, effect
      // stage): re-derive them so a reset/undo can't bring back a stale colourway
      const c = action.collection;
      if (!isObj(c) || !isObj(c.items)) return state;
      const styleId = typeof c.dropStyle === "string" ? c.dropStyle : state.collection.dropStyle;
      return { ...state, collection: rebuildCollection({ ...c, dropStyle: styleId }, styleId, state.palette, { stage: state.collection.effectStage ?? null }) };
    }

    case "setEffectStage": {
      const stage = action.stage === "dark" ? "dark" : null;
      if ((state.collection.effectStage ?? null) === stage) return state;
      return { ...state, collection: rebuildCollection(state.collection, state.collection.dropStyle, state.palette, { stage }) };
    }

    case "setRoster": {
      const roster = typeof action.roster === "function" ? action.roster(state.roster) : action.roster;
      return Array.isArray(roster) ? { ...state, roster } : state;
    }

    case "setExtras": {
      const extras = typeof action.extras === "function" ? action.extras(state.extras) : action.extras;
      return isObj(extras) ? { ...state, extras } : state;
    }

    case "setContact":
      return { ...state, contact: { ...state.contact, ...action.contact } };

    case "markSubmitted":
      return {
        ...state,
        order: {
          status: "submitted",
          ref: action.ref ?? null,
          channel: action.channel ?? null,
          submittedAt: action.submittedAt || new Date().toISOString(),
        },
      };

    case "reopenOrder":
      return { ...state, order: { ...DRAFT_ORDER } };

    case "dismissFlag":
      return { ...state, flags: { ...state.flags, [action.flag]: false } };

    case "reset":
      return createInitialState();

    case "hydrate":
      return action.state;

    default:
      return state;
  }
}

/* ───────────────────────────── persistence ───────────────────────────── */

function serialize(state, { withLogo = true } = {}) {
  const { logo, ...rest } = state;
  const storedLogo = logo.sampleId
    ? { sampleId: logo.sampleId, name: logo.name, bgRemoved: logo.bgRemoved, tolerance: logo.tolerance }
    : withLogo
      ? { src: logo.src, name: logo.name, bgRemoved: logo.bgRemoved, tolerance: logo.tolerance }
      : { dropped: true, name: logo.name };
  return { ...rest, version: VERSION, logo: storedLogo, flags: undefined };
}

function persist(state) {
  const full = storage.save(STORAGE_KEY, serialize(state));
  if (full.ok || full.reason === "unavailable") return full;
  // too big (quota) — keep everything except the uploaded image
  return storage.save(STORAGE_KEY, serialize(state, { withLogo: false }));
}

/* stored roster/contact/extras come back as whatever was saved (an older build, a hand
   edit, a corrupt write): coerce them to the shapes the pages render, never crash #order */
const str = (v) => (v == null ? "" : typeof v === "object" ? "" : String(v));

function sanitizeRoster(rows) {
  const seen = new Set();
  let n = 0;
  const out = [];
  for (const r of rows) {
    if (!isObj(r)) continue;
    let id = typeof r.id === "string" || typeof r.id === "number" ? String(r.id).trim() : "";
    while (!id || seen.has(id)) id = `r-restored-${++n}`;
    seen.add(id);
    const items = {};
    if (isObj(r.items)) for (const [g, on] of Object.entries(r.items)) if (typeof on === "boolean") items[g] = on;
    out.push({ ...r, id, name: str(r.name), number: str(r.number), top: str(r.top), bottom: str(r.bottom), items });
  }
  return out;
}

function sanitizeContact(c) {
  const out = { ...EMPTY_CONTACT };
  if (!isObj(c)) return out;
  for (const k of Object.keys(EMPTY_CONTACT)) out[k] = str(c[k]);
  if ("rightsConfirmed" in c) out.rightsConfirmed = c.rightsConfirmed === true; // Review's checkbox
  return out;
}

function sanitizeExtras(x) {
  const out = {};
  if (!isObj(x)) return out;
  for (const [g, bySize] of Object.entries(x)) {
    if (!isObj(bySize)) continue;
    const sizes = {};
    for (const [size, q] of Object.entries(bySize)) {
      const n = Math.floor(Number(q));
      if (Number.isFinite(n) && n > 0) sizes[size] = Math.min(n, 9999);
    }
    out[g] = sizes;
  }
  return out;
}

/** hydrate(raw) → a valid state or null. Anything malformed falls back to the defaults. */
function hydrate(raw) {
  if (!isObj(raw) || raw.version !== VERSION) return null;
  const base = createInitialState();
  try {
    const palette = normPalette(raw.palette, base.palette);
    const flags = { logoNotSaved: false };
    let logo = base.logo;
    let team = isObj(raw.team)
      ? { school: raw.team.school == null ? base.team.school : str(raw.team.school), mascot: raw.team.mascot == null ? base.team.mascot : str(raw.team.mascot), isSample: !!raw.team.isSample }
      : base.team;
    const rl = raw.logo;
    if (isObj(rl) && rl.sampleId) {
      const s = SAMPLE_LOGOS.find((x) => x.id === rl.sampleId) || DEFAULT_SAMPLE;
      const l = { ...sampleLogo(s), bgRemoved: [true, false, "auto"].includes(rl.bgRemoved) ? rl.bgRemoved : "auto", tolerance: Number(rl.tolerance) || DEFAULT_TOLERANCE };
      logo = { ...l, key: logoKey(l) };
      team = { ...team, isSample: true };
    } else if (isObj(rl) && typeof rl.src === "string" && rl.src) {
      const l = { src: rl.src, name: String(rl.name || "Your logo"), bgRemoved: [true, false, "auto"].includes(rl.bgRemoved) ? rl.bgRemoved : "auto", tolerance: Number(rl.tolerance) || DEFAULT_TOLERANCE };
      logo = { ...l, key: logoKey(l) };
      team = { ...team, isSample: false };
    } else if (isObj(rl) && rl.dropped) {
      flags.logoNotSaved = true;
      team = { ...team, isSample: true };
    }
    // items the coach never edited are a pure function of (drop style, palette): rebuild them
    // from the current recipes so recipe updates reach returning visitors; keep `enabled`
    // flags and `custom` items as stored
    const collection =
      isObj(raw.collection) && isObj(raw.collection.items) && typeof raw.collection.dropStyle === "string"
        ? rebuildCollection(raw.collection, raw.collection.dropStyle, palette, { stage: raw.collection.effectStage === "dark" ? "dark" : null })
        : buildCollection("statement", palette);
    const effect = isObj(raw.effect) && typeof raw.effect.id === "string"
      ? { id: raw.effect.id, params: isObj(raw.effect.params) ? raw.effect.params : {}, seed: Number.isFinite(raw.effect.seed) ? raw.effect.seed : 7 }
      : base.effect;
    return {
      version: VERSION,
      team,
      logo,
      palette,
      effect,
      favorites: Array.isArray(raw.favorites) ? raw.favorites.filter((f) => typeof f === "string") : [],
      collection,
      roster: Array.isArray(raw.roster) ? sanitizeRoster(raw.roster) : base.roster,
      extras: sanitizeExtras(raw.extras),
      contact: sanitizeContact(raw.contact),
      order: isObj(raw.order) && (raw.order.status === "draft" || raw.order.status === "submitted")
        ? {
          ...DRAFT_ORDER, ...raw.order,
          ref: typeof raw.order.ref === "string" ? raw.order.ref : null,
          channel: typeof raw.order.channel === "string" ? raw.order.channel : null,
          submittedAt: typeof raw.order.submittedAt === "string" || Number.isFinite(raw.order.submittedAt) ? raw.order.submittedAt : null,
        }
        : { ...DRAFT_ORDER },
      flags,
    };
  } catch (e) {
    console.warn("[store] stored state unreadable, starting fresh —", e?.message || e);
    return null;
  }
}

function initState() {
  return hydrate(storage.load(STORAGE_KEY)) || createInitialState();
}

/* ───────────────────────────── provider ───────────────────────────── */

const StoreContext = createContext(null);
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function StoreProvider({ children, initialState, persist: persistOn = true }) {
  const [state, dispatch] = useReducer(reducer, initialState, (s) => s || initState());

  // team colours → CSS custom properties on <html>
  useIsoLayoutEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(teamCssVars(state.palette))) root.style.setProperty(k, v);
    root.style.removeProperty("--team-flash"); // theme-aware in tokens.css (was inline before)
  }, [state.palette]);

  // debounced persistence (flush on page hide)
  const latest = useRef(state);
  latest.current = state;
  const first = useRef(true);
  useEffect(() => {
    if (!persistOn) return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => persist(latest.current), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state, persistOn]);
  useEffect(() => {
    if (!persistOn) return;
    const flush = () => persist(latest.current);
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [persistOn]);

  // the chosen effect may not exist (renamed, failed to load) → fall back gracefully
  // (missing file → fix now; file present → verify it actually loads once the page is idle)
  const effectId = state.effect.id;
  useEffect(() => {
    let alive = true;
    const check = () =>
      loadEffects()
        .then((list) => {
          if (!alive || !list?.length || list.some((e) => e.id === effectId)) return;
          const fb = list.find((e) => e.id === DEFAULT_EFFECT_ID) || list.find((e) => e.id !== "original") || list[0];
          if (fb && fb.id !== effectId) dispatch({ type: "setEffect", id: fb.id, params: {} });
        })
        .catch(() => {});
    const present = availableEffectIds().includes(effectId);
    const t = setTimeout(check, present ? 2500 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [effectId]);

  // effect-aware colourways: the collection follows the chosen effect's stage (dark-stage
  // looks move light pieces onto dark bases). The stage lives on the collection, so this
  // stays synchronous: render with what's stored, rebuild once the effect module answers.
  // The lookup for the effect the page opened with waits a moment (it may load the effect
  // modules while the first page renders); a newly picked effect is looked up at once.
  const initialEffectId = useRef(effectId);
  useEffect(() => {
    let alive = true;
    const run = () =>
      getEffect(effectId)
        .then((e) => { if (alive && e) dispatch({ type: "setEffectStage", stage: e.stage }); })
        .catch(() => {});
    const t = setTimeout(run, effectId === initialEffectId.current ? 1200 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [effectId]);

  const actions = useMemo(() => ({
    setTeam: (team) => dispatch({ type: "setTeam", team }),
    /** setLogo({ src?, name?, bgRemoved?, tolerance?, sampleId? }) — merges; key is recomputed. */
    setLogo: (logo) => dispatch({ type: "setLogo", logo }),
    /** loadSample(id) — sample logo + its team name + palette. */
    loadSample: (id) => dispatch({ type: "loadSample", id }),
    setPalette: (palette) => dispatch({ type: "setPalette", palette }),
    /** setEffect(id, { params?, seed? }) — params reset to {} when the id changes unless given. */
    setEffect: (id, { params, seed } = {}) => dispatch({ type: "setEffect", id, params, seed }),
    /** setEffectParams(patch | null) — merge overrides; null (or no arg) clears them. */
    setEffectParams: (params = null) => dispatch({ type: "setEffectParams", params }),
    setEffectSeed: (seed) => dispatch({ type: "setEffectSeed", seed }),
    toggleFavorite: (id) => dispatch({ type: "toggleFavorite", id }),
    setDropStyle: (id) => dispatch({ type: "setDropStyle", id }),
    /** updateItem(garmentId, patch | (item) => patch) — colors merge; marks the item custom. */
    updateItem: (garmentId, patch) => dispatch({ type: "updateItem", garmentId, patch }),
    setCollection: (collection) => dispatch({ type: "setCollection", collection }),
    /** setRoster(rows | (rows) => rows) */
    setRoster: (roster) => dispatch({ type: "setRoster", roster }),
    /** setExtras(extras | (extras) => extras) */
    setExtras: (extras) => dispatch({ type: "setExtras", extras }),
    setContact: (contact) => dispatch({ type: "setContact", contact }),
    markSubmitted: ({ ref, channel, submittedAt } = {}) => dispatch({ type: "markSubmitted", ref, channel, submittedAt }),
    reopenOrder: () => dispatch({ type: "reopenOrder" }),
    dismissFlag: (flag) => dispatch({ type: "dismissFlag", flag }),
    reset: () => { storage.remove(STORAGE_KEY); dispatch({ type: "reset" }); },
  }), []);

  // test/debug handle (e2e scripts read state and drive actions through it)
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__mascotLab = { getState: () => latest.current, actions, storageKey: STORAGE_KEY };
  }, [actions]);

  const value = useMemo(() => ({ state, dispatch, actions }), [state, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** useStore() → { state, dispatch, actions }. */
export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore() must be used inside <StoreProvider>.");
  return ctx;
}

/** Example rows are still in the roster (the coach hasn't replaced them yet). */
export function rosterHasExamples(roster) {
  return Array.isArray(roster) && roster.some((r) => r && r.example);
}
