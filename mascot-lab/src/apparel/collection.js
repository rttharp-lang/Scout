// Mascot Lab — drop styles: how the chosen graphic is placed across the whole kit.
//
// A drop style is a recipe per garment: a two-tone colourway (palette roles, so the
// set reads as one collection) plus placements for the front and back. Each
// placement is a renderMockup Placement without `canvas`, plus `source`:
//   "effect" → the coach's chosen effect render   (statement hits, repeats)
//   "logo"   → the clean logo                       (small crests read cleaner)
//
// Zone ids are the ones in CONTRACTS.md. Recipes exist for all six garments even
// while some garment files are still being drawn; the UI simply skips garments the
// registry did not load.

export const DROP_STYLES = [
  {
    id: "statement",
    name: "Statement",
    blurb: "Oversized hits that crop off the edge. The warm-up look.",
    note: "Built like a pro warm-up drop: one giant graphic per piece, cropped hard by the seams.",
  },
  {
    id: "classic",
    name: "Classic",
    blurb: "Chest crests, numbers, clean back hits.",
    note: "Game-day staples: clean crest up front, one confident hit on the back.",
  },
  {
    id: "allover",
    name: "All-over",
    blurb: "Your graphic as a repeat print, edge to edge.",
    note: "A brick-repeat print on every panel: full colour on game pieces, one ink on fleece.",
  },
  {
    id: "tonal",
    name: "Tonal",
    blurb: "Graphic printed a shade off the base. Understated.",
    note: "Graphics a shade off the garment colour. Reads up close, quiet from across the gym.",
  },
];

const ROLES = ["primary", "secondary", "accent", "dark", "light"];
const FALLBACK = { primary: "#13294B", secondary: "#F2A900", accent: "#FFFFFF", dark: "#0B0D10", light: "#F4F5F7" };

/* ───────────────────────────── colour helpers ───────────────────────────── */

function normHex(v) {
  if (typeof v !== "string") return null;
  let h = v.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(h) ? "#" + h.toUpperCase() : null;
}
function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function hexOf(r, g, b) {
  const c = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return ("#" + c(r) + c(g) + c(b)).toUpperCase();
}
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return hexOf(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
function luminance(h) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(h);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

/** resolveColor(role | hex, palette) → "#RRGGBB". */
export function resolveColor(v, palette) {
  const pal = { ...FALLBACK, ...(palette || {}) };
  if (ROLES.includes(v)) return normHex(pal[v]) || FALLBACK[v];
  return normHex(v) || normHex(pal.primary) || FALLBACK.primary;
}

/** resolveColors({ base, trim, accent } as roles/hex, palette) → { base, trim, accent } as "#RRGGBB". */
export function resolveColors(colors, palette) {
  const c = colors || {};
  return {
    base: resolveColor(c.base ?? "primary", palette),
    trim: resolveColor(c.trim ?? "secondary", palette),
    accent: resolveColor(c.accent ?? "accent", palette),
  };
}

/**
 * tonalTint(baseHex) → a shade/tint of the base for understated prints. Dark bases
 * get a lighter tint, light bases a darker shade, mid tones go darker — always a
 * visible step (≈1.35–1.6:1 contrast) but never a loud one.
 */
export function tonalTint(base) {
  const b = normHex(base) || FALLBACK.primary;
  const L = luminance(b);
  const toward = L < 0.18 ? "#FFFFFF" : "#000000";
  const target = L < 0.18 ? 1.42 : 1.38;
  let lo = 0, hi = 0.6, t = 0.2;
  for (let i = 0; i < 18; i++) {           // bisect the mix amount to hit the target contrast
    t = (lo + hi) / 2;
    if (contrast(b, mix(b, toward, t)) < target) lo = t; else hi = t;
  }
  return mix(b, toward, t);
}

/** pickContrast(baseHex, candidates[], palette) → the first role/hex that reads on the base (≥ 3:1), else the best one. */
function pickContrast(base, candidates, palette) {
  let best = candidates[0], bestC = 0;
  for (const c of candidates) {
    const cc = contrast(base, resolveColor(c, palette));
    if (cc >= 3) return c;
    if (cc > bestC) { bestC = cc; best = c; }
  }
  return best;
}

/* ───────────────────────────── recipes ─────────────────────────────
 * Placement shorthand: P(source, zone, extra) → PlacementSpec.
 */
const P = (source, zone, extra = {}) => ({
  source, zone, scale: 1, dx: 0, dy: 0, rotate: 0, mode: "single", tile: 220, opacity: 1, tint: null, blend: "normal",
  ...extra,
});
const NUMBERS = { name: true, number: true };
const NAME_ONLY = { name: true, number: false };

/** Colourway: roles, with the accent (lettering / third colour) chosen to read on the base. */
function cw(base, trim, palette, accentPrefs = ["accent", "light", "secondary", "dark"]) {
  const baseHex = resolveColor(base, palette);
  const trimHex = resolveColor(trim, palette);
  // a trim identical to the base would erase the two-tone; fall back to the next role
  if (contrast(baseHex, trimHex) < 1.25) {
    trim = pickContrast(baseHex, ["secondary", "accent", "light", "dark", "primary"].filter((r) => r !== base), palette);
  }
  return { base, trim, accent: pickContrast(baseHex, accentPrefs.filter((r) => r !== base), palette) };
}

const RECIPES = {
  // Pro warm-up drop: giant cropped hits on two-tone pieces; game jersey keeps its numbers.
  statement: (pal) => ({
    jersey: {
      colors: cw("primary", "secondary", pal),
      // the mascot rises out of the hem, cropped by the hem and side panels. Geometry:
      // oversized zone centre y 680 + 0.463·860 → 1078; SAFE box 1.12·860 = 963 tall, so
      // its top lands at ≈ 596 — just under the front number box for ANY logo shape
      front: [P("effect", "oversized", { scale: 1.12, dx: -0.03, dy: 0.463 })],
      back: [],
      text: NUMBERS,
    },
    shorts: {
      colors: cw("primary", "secondary", pal),
      // the zone is tuned so scale 1 rises out of the left leg, cropped by hem + side panel
      front: [P("effect", "oversized", { scale: 1.0 })],
      back: [P("logo", "waist-back", { scale: 0.9 })],
      text: null,
    },
    hoodie: {
      colors: cw("dark", "primary", pal, ["secondary", "accent", "light"]),
      // the hero piece: the mascot's face cropped hard by the right armhole seam and the
      // rib band (clears the hood foot), plus the big centred back hit
      front: [P("effect", "oversized", { scale: 0.96, dx: -0.08, dy: -0.02 })],
      back: [P("effect", "back-center", { scale: 1.04, dy: -0.025 })],
      text: null,
    },
    pants: {
      colors: cw("dark", "primary", pal, ["secondary", "accent", "light"]),
      // one giant hit running down the left leg, cropped by the outseam and inseam
      front: [P("effect", "oversized", { scale: 1.0 })],
      back: [P("logo", "back-leg", { scale: 0.85 })],
      text: null,
    },
    tee: {
      colors: cw("light", "primary", pal, ["primary", "dark", "secondary"]),
      front: [P("effect", "center", { scale: 1.12, dy: 0.02 })],
      back: [P("effect", "oversized", { scale: 1.05 })],
      text: null,
    },
    longsleeve: {
      colors: cw("secondary", "primary", pal, ["primary", "dark", "accent"]),
      // raglan two-tone: the mascot's face cropped hard by the right side seam and hem;
      // the back stays a clean player back (name over number)
      front: [P("effect", "oversized", { scale: 1.0, dx: -0.04 })],
      back: [],
      text: NUMBERS,
    },
  }),

  // Game-day staples: clean crests, numbers, one effect hit where there is room.
  classic: (pal) => ({
    jersey: {
      colors: cw("primary", "secondary", pal),
      front: [P("logo", "chest-center", { scale: 1.0 })],
      back: [],
      text: NUMBERS,
    },
    shorts: {
      colors: cw("primary", "secondary", pal),
      front: [P("logo", "leg-left", { scale: 0.85 })],
      back: [P("logo", "waist-back", { scale: 0.75 })],
      text: null,
    },
    hoodie: {
      colors: cw("light", "primary", pal, ["primary", "dark", "secondary"]),
      front: [P("effect", "center", { scale: 0.8, dy: -0.1 })],
      back: [P("logo", "back-yoke", { scale: 0.95 })],
      text: null,
    },
    pants: {
      colors: cw("primary", "secondary", pal),
      front: [P("logo", "thigh-left", { scale: 0.9 })],
      back: [P("logo", "waist-back", { scale: 0.75 })],
      text: null,
    },
    tee: {
      colors: cw("secondary", "primary", pal, ["primary", "dark", "accent"]),
      front: [P("logo", "chest-left", { scale: 0.95 })],
      back: [P("effect", "back-center", { scale: 0.92, dy: -0.04 })],
      text: null,
    },
    longsleeve: {
      // the classic baseball raglan: team colour body, contrast sleeves; small crest at
      // the nape over name + number
      colors: cw("primary", "secondary", pal, ["accent", "light", "secondary"]),
      front: [P("logo", "chest-center", { scale: 1.0 })],
      back: [P("logo", "back-yoke", { scale: 0.8 })],
      text: NUMBERS,
    },
  }),

  // Repeat print edge to edge: full colour on game pieces, single ink on fleece/pants.
  allover: (pal) => {
    const T = (extra = {}) => P("effect", "center", { mode: "tile", tile: 215, scale: 0.8, rotate: -12, ...extra });
    const items = {
      jersey: { colors: cw("primary", "secondary", pal), front: [T()], back: [T()], text: NUMBERS },
      shorts: { colors: cw("primary", "secondary", pal), front: [T({ tile: 190 })], back: [T({ tile: 190 })], text: null },
      hoodie: { colors: cw("dark", "primary", pal, ["secondary", "accent", "light"]), front: [T({ tile: 200 })], back: [T({ tile: 200 })], text: null },
      pants: { colors: cw("dark", "primary", pal, ["secondary", "accent", "light"]), front: [T({ tile: 165 })], back: [T({ tile: 165 })], text: null },
      tee: { colors: cw("light", "primary", pal, ["primary", "dark", "secondary"]), front: [T({ tile: 185, scale: 0.78 })], back: [T({ tile: 185, scale: 0.78 })], text: null },
      // one-ink repeat in the sleeve colour; no lettering (it would sit in the same ink)
      longsleeve: { colors: cw("secondary", "primary", pal, ["primary", "dark", "accent"]), front: [T()], back: [T()], text: null },
    };
    // single-ink repeats on the warm-up pieces, printed in the piece's accent (the third
    // colour, already chosen to read on that base)
    for (const id of ["hoodie", "pants", "longsleeve"]) {
      const ink = resolveColor(items[id].colors.accent, pal);
      for (const v of ["front", "back"]) items[id][v] = items[id][v].map((p) => ({ ...p, tint: ink, opacity: 0.92 }));
    }
    return items;
  },

  // Quiet luxury: every graphic a shade off its base; lettering keeps a tonal outline.
  tonal: (pal) => {
    const items = {
      jersey: { colors: cw("primary", "dark", pal), front: [P("effect", "oversized", { scale: 1.02, dx: 0.02 })], back: [P("effect", "back-center", { scale: 1.05, dy: 0.06 })], text: NUMBERS },
      // shorts + pants: drawcords take the trim colour too (accent only colours the cords)
      shorts: { colors: ((c) => ({ ...c, accent: c.trim }))(cw("primary", "dark", pal)), front: [P("effect", "oversized", { scale: 1.0 })], back: [P("logo", "waist-back", { scale: 0.9 })], text: null },
      // drawcords take the trim colour (accent) so nothing on the hoodie shouts
      hoodie: { colors: ((c) => ({ ...c, accent: c.trim }))(cw("dark", "primary", pal)), front: [P("effect", "center", { scale: 1.0, dy: -0.04 })], back: [P("effect", "oversized", { scale: 1.05 })], text: null },
      pants: { colors: ((c) => ({ ...c, accent: c.trim }))(cw("dark", "primary", pal)), front: [P("logo", "leg-left-long", { scale: 1.0 })], back: [P("logo", "waist-back", { scale: 0.8 })], text: null },
      // the light piece gets a tonal grey trim so it stays in the quiet family
      tee: { colors: { ...cw("light", "primary", pal, ["primary", "dark"]), trim: tonalTint(tonalTint(resolveColor("light", pal))) }, front: [P("effect", "center", { scale: 1.0 })], back: [P("logo", "back-yoke", { scale: 0.85 })], text: null },
      longsleeve: { colors: cw("primary", "dark", pal), front: [P("logo", "chest-left", { scale: 0.95 })], back: [P("effect", "oversized", { scale: 1.05 })], text: NAME_ONLY },
    };
    for (const it of Object.values(items)) {
      const tint = tonalTint(resolveColor(it.colors.base, pal));
      for (const v of ["front", "back"]) it[v] = it[v].map((p) => ({ ...p, tint }));
    }
    return items;
  },
};

/**
 * buildCollection(dropStyleId, palette) → Collection (see CONTRACTS.md).
 * Unknown ids fall back to "statement". Colours stay as palette roles (resolve them
 * with resolveColors at render time); tonal tints are resolved hexes.
 */
export function buildCollection(dropStyleId, palette) {
  const style = DROP_STYLES.find((s) => s.id === dropStyleId) || DROP_STYLES[0];
  const pal = { ...FALLBACK, ...(palette || {}) };
  const recipe = RECIPES[style.id](pal);
  const items = {};
  for (const [id, r] of Object.entries(recipe)) {
    items[id] = {
      enabled: true,
      colors: { ...r.colors },
      front: r.front.map((p) => ({ ...p })),
      back: r.back.map((p) => ({ ...p })),
      text: r.text ? { ...r.text } : null,
    };
  }
  return { dropStyle: style.id, items };
}

/** getDropStyle(id) → drop style meta or null. */
export function getDropStyle(id) {
  return DROP_STYLES.find((s) => s.id === id) || null;
}
