// Mascot Lab — effect registry. Every ./<id>.js file (except this one) is an effect
// module; they are lazy-loaded, validated, and any broken one is skipped with a warning
// so a single bad effect can never take the gallery down.

/** Gallery categories (ids are used by effects' `category`). */
export const CATEGORIES = [
  { id: "print", label: "Print shop" },
  { id: "street", label: "Street" },
  { id: "metal", label: "Chrome & light" },
  { id: "retro", label: "Varsity & craft" },
  { id: "digital", label: "Digital" },
];

/**
 * Gallery order; ids not listed sort after these, by name. "original" is always first.
 * Curated: the hero (graffiti) leads, the strongest and most distinct looks come early,
 * and neighbours alternate stage / colour so no two adjacent tiles read alike (the
 * logo-colour "decoration" looks — sticker, varsity, puff, embroidery — are spread out).
 */
export const EFFECT_ORDER = [
  "original", "graffiti", "chrome", "halftone", "neon", "screenprint", "holographic",
  "stencil", "thermal", "chenille", "risograph", "glitch", "varsity", "woodcut", "sticker",
  "pixel", "embroidery", "melt", "speed", "puff", "ascii", "scribble", "emboss",
];

const MODULES = import.meta.glob(["./*.js", "!./index.js"]);

const ROLES = ["primary", "secondary", "accent", "dark", "light"];
const PARAM_TYPES = ["range", "color", "select", "toggle"];
const STAGES = ["paper", "dark", "mid", "team"];
const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** validateParam(spec) → error string or null. */
function validateParam(p) {
  if (!p || typeof p !== "object") return "param is not an object";
  if (typeof p.key !== "string" || !p.key) return "param without a key";
  if (!PARAM_TYPES.includes(p.type)) return `param "${p.key}" has unknown type "${p.type}"`;
  if (typeof p.label !== "string") return `param "${p.key}" has no label`;
  switch (p.type) {
    case "range":
      if (![p.min, p.max, p.default].every(Number.isFinite) || !(p.max > p.min)) return `range "${p.key}" needs numeric min < max and default`;
      if (p.default < p.min || p.default > p.max) return `range "${p.key}" default is out of range`;
      if (p.step !== undefined && !(p.step > 0)) return `range "${p.key}" step must be > 0`;
      break;
    case "color":
      if (!ROLES.includes(p.default) && !isHex(p.default)) return `color "${p.key}" default must be a role or #RRGGBB`;
      break;
    case "select":
      if (!Array.isArray(p.options) || !p.options.length || !p.options.every((o) => o && "value" in o && typeof o.label === "string")) return `select "${p.key}" needs options [{ value, label }]`;
      if (!p.options.some((o) => o.value === p.default)) return `select "${p.key}" default is not one of its options`;
      break;
    case "toggle":
      if (typeof p.default !== "boolean") return `toggle "${p.key}" default must be boolean`;
      break;
  }
  return null;
}

/** validateEffect(effect, id) → error string or null (also normalizes presets/stage/category). */
export function validateEffect(eff, id) {
  if (!eff || typeof eff !== "object") return "no default export";
  if (eff.id !== id) return `id "${eff.id}" must equal the filename "${id}"`;
  if (typeof eff.render !== "function") return "render is not a function";
  if (typeof eff.name !== "string" || !eff.name) return "missing name";
  if (!Array.isArray(eff.params)) return "params must be an array";
  const keys = new Set();
  for (const p of eff.params) {
    const err = validateParam(p);
    if (err) return err;
    if (keys.has(p.key)) return `duplicate param key "${p.key}"`;
    keys.add(p.key);
  }
  if (!CATEGORIES.some((c) => c.id === eff.category)) {
    console.warn(`[effects] ${id}: unknown category "${eff.category}", using "print"`);
    eff.category = "print";
  }
  if (!STAGES.includes(eff.stage)) eff.stage = "paper";
  if (!Array.isArray(eff.presets)) eff.presets = [];
  eff.presets = eff.presets.filter((pr) => pr && typeof pr.name === "string" && pr.params && typeof pr.params === "object");
  if (!eff.presets.length) eff.presets = [{ name: eff.name, params: {} }];
  return null;
}

const METHODS = ["Screen print", "Sublimation", "Embroidery", "Chenille patch", "Heat transfer", "Puff print"];

/**
 * lintEffect(effect) → string[] — soft CONTRACTS.md problems that do NOT stop an effect
 * from loading (name/blurb length, method, 3–7 params, 2–4 presets, preset keys, palette
 * roles as color defaults). harness/effects.html prints them as [lint] warnings.
 */
export function lintEffect(eff) {
  const w = [];
  if (!eff || typeof eff !== "object") return w;
  if (typeof eff.name === "string" && eff.name.length > 16) w.push(`name is ${eff.name.length} chars (max 16)`);
  if (typeof eff.blurb !== "string" || !eff.blurb.trim()) w.push("missing blurb");
  else if (eff.blurb.length > 60) w.push(`blurb is ${eff.blurb.length} chars (max 60)`);
  if (!METHODS.includes(eff.method)) w.push(`method "${eff.method}" is not one of: ${METHODS.join(", ")}`);
  const params = Array.isArray(eff.params) ? eff.params : [];
  if (params.length < 3 || params.length > 7) w.push(`${params.length} params (contract: 3–7)`);
  for (const p of params) if (p?.type === "color" && !ROLES.includes(p.default)) w.push(`color "${p.key}" defaults to a hex, not a palette role`);
  const presets = Array.isArray(eff.presets) ? eff.presets : [];
  if (presets.length < 2 || presets.length > 4) w.push(`${presets.length} preset(s) (contract: 2–4)`);
  const keys = new Set(params.map((p) => p?.key));
  for (const pr of presets) {
    const bad = Object.keys(pr?.params || {}).filter((k) => !keys.has(k));
    if (bad.length) w.push(`preset "${pr.name}" sets unknown param(s) ${bad.join(", ")}`);
  }
  if (!EFFECT_ORDER.includes(eff.id)) w.push(`id "${eff.id}" is not in EFFECT_ORDER (sorts after the listed effects)`);
  return w;
}

let loading = null;

/** loadEffects() → Promise<Effect[]> — all valid effects in gallery order (memoized). */
export function loadEffects() {
  if (loading) return loading;
  loading = (async () => {
    const entries = Object.entries(MODULES);
    const settled = await Promise.allSettled(entries.map(([, load]) => load()));
    const effects = [];
    settled.forEach((res, i) => {
      const path = entries[i][0];
      const id = path.replace(/^\.\//, "").replace(/\.js$/, "");
      if (res.status === "rejected") {
        console.warn(`[effects] skipped ${id}: failed to load —`, res.reason?.message || res.reason);
        return;
      }
      const eff = res.value?.default;
      const err = validateEffect(eff, id);
      if (err) { console.warn(`[effects] skipped ${id}: ${err}`); return; }
      effects.push(eff);
    });
    const rank = (e) => { const i = EFFECT_ORDER.indexOf(e.id); return i < 0 ? EFFECT_ORDER.length : i; };
    effects.sort((a, b) => (a.id === "original" ? -1 : b.id === "original" ? 1 : 0) || rank(a) - rank(b) || a.name.localeCompare(b.name));
    return effects;
  })();
  return loading;
}

/** getEffect(id) → Promise<Effect | null>. */
export async function getEffect(id) {
  return (await loadEffects()).find((e) => e.id === id) || null;
}

/** availableEffectIds() → ids of every effect file present (loaded or not). */
export function availableEffectIds() {
  return Object.keys(MODULES).map((p) => p.replace(/^\.\//, "").replace(/\.js$/, ""));
}

