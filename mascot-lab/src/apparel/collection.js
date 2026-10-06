// Mascot Lab — drop styles: how the chosen graphic is placed across the whole kit.
//
// A drop style is a recipe per garment: a two-tone colourway (palette roles, so the
// set reads as one collection) plus placements for the front and back. Each
// placement is a renderMockup Placement without `canvas`, plus `source`:
//   "effect" → the coach's chosen effect render   (statement hits, repeats)
//   "logo"   → the clean logo                       (small crests read cleaner)
//
// Art direction (reviewed as one line, all six pieces side by side):
//   Statement  Standard-Issue energy. Every piece carries one giant mascot cropped by a
//              seam or hem, but always cropped so the face still reads (eyes + muzzle).
//              The game jersey keeps its numbers: the mascot sits under the number,
//              90s-throwback style, and wraps round to the back under name + number.
//   Classic    Clean crests, numbers, small back hits; the effect shows up once per
//              warm-up piece (hoodie front, tee back).
//   All-over   Hero pieces in a sublimated brick repeat (jersey + shorts in full colour,
//              hoodie in one ink) next to solid companions (pants, tee, shooting shirt)
//              that carry a single hit, so the set doesn't turn into wallpaper.
//   Tonal      Big graphics a shade off the base: quiet, but large enough to read on
//              near-black and on white at thumbnail size.
//
// Colourways are chosen per palette, not hard-coded: trims must actually contrast with
// their base, lettering fill and outline must be distinct from each other and one of
// them must read on the base, and drawcords avoid the colour of an all-over ink.
//
// Zone ids are the ones in CONTRACTS.md. The UI skips garments the registry did not load.

export const DROP_STYLES = [
  {
    id: "statement",
    name: "Statement",
    blurb: "Oversized hits that crop off the edge. The warm-up look.",
    note: "One giant mascot per piece, cropped by the seams and hem. The game jersey keeps its numbers.",
  },
  {
    id: "classic",
    name: "Classic",
    blurb: "Chest crests, numbers, clean back hits.",
    note: "Clean crests and numbers on the uniform. Your look shows up once on the hoodie and the tee.",
  },
  {
    id: "allover",
    name: "All-over",
    blurb: "Your graphic as a repeat print, edge to edge.",
    note: "A repeat print on the jersey, shorts and hoodie. The pants, tee and shooting shirt stay solid with one hit.",
  },
  {
    id: "tonal",
    name: "Tonal",
    blurb: "Graphic printed a shade off the base. Understated.",
    note: "Big graphics a shade off the garment color. Reads up close, quiet from across the gym.",
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
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
function luminance(h) {
  const [r, g, b] = rgb(h);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/** CIELAB (D65) — for "are these two colours visibly different" (hue counts, not just lightness). */
function lab(h) {
  const [R, G, B] = rgb(h).map(lin);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function deltaE(a, b) { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); }

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
 * get a lighter tint, light bases a darker shade, mid tones go darker. The step is
 * sized to read at thumbnail size: near-black needs a bigger contrast ratio than navy
 * for the same visible step, because fleece texture and shading eat into it.
 */
export function tonalTint(base) {
  const b = normHex(base) || FALLBACK.primary;
  const L = luminance(b);
  const toward = L < 0.18 ? "#FFFFFF" : "#000000";
  const target = L < 0.012 ? 1.62 : L < 0.18 ? 1.5 : 1.42;
  let lo = 0, hi = 0.7, t = 0.2;
  for (let i = 0; i < 18; i++) {           // bisect the mix amount to hit the target contrast
    t = (lo + hi) / 2;
    if (contrast(b, mix(b, toward, t)) < target) lo = t; else hi = t;
  }
  return mix(b, toward, t);
}

/** Roles (or hexes) in preference order, minus `except`. */
const without = (list, ...except) => list.filter((r) => !except.includes(r));

/**
 * pickTrim(base, prefs, pal, min) → the first role whose colour stands apart from the
 * base (contrast ≥ min, or a clear hue change), else the strongest one. Two-tone pieces
 * need a real second colour: navy on near-black or white on light grey reads as one.
 */
function pickTrim(base, prefs, pal, min = 1.5) {
  const B = resolveColor(base, pal);
  let best = prefs[0], score = -1;
  for (const r of prefs) {
    const C = resolveColor(r, pal);
    const c = contrast(B, C), e = deltaE(B, C);
    if (c >= min || (c >= 1.25 && e >= 45)) return r;
    if (c > score) { score = c; best = r; }
  }
  return best;
}

/** pickReadable(base, prefs, pal, min) → the first role that reads on the base (≥ min), else the best. */
function pickReadable(base, prefs, pal, min = 3) {
  const B = resolveColor(base, pal);
  let best = prefs[0], score = -1;
  for (const r of prefs) {
    const c = contrast(B, resolveColor(r, pal));
    if (c >= min) return r;
    if (c > score) { score = c; best = r; }
  }
  return best;
}

/**
 * pickLettering(base, trim, pal) → the fill role for tackle-twill lettering, whose
 * outline is always the trim (renderMockup convention: fill = accent, outline = trim).
 * Fill and outline must be visibly different colours, and at least one of them must
 * read on the base, so names and numbers are always two-colour and legible:
 * navy + gold trim → white fill; gold + navy trim → white fill (the navy outline
 * carries it); green + white trim → vegas-gold fill.
 */
function pickLettering(base, trim, pal, prefs = ["accent", "light", "secondary", "primary", "dark"]) {
  const B = resolveColor(base, pal), T = resolveColor(trim, pal);
  const trimReads = contrast(B, T) >= 3;
  let fallback = null, fbScore = -1;
  for (const r of prefs) {
    if (r === base || r === trim) continue;
    const F = resolveColor(r, pal);
    const okOutline = deltaE(F, T) >= 30;
    const okBase = contrast(F, B) >= 1.6 || deltaE(F, B) >= 40;
    if (okOutline && okBase && (trimReads || contrast(F, B) >= 3)) return r;
    const s = contrast(F, B);
    if (s > fbScore) { fbScore = s; fallback = r; }
  }
  return fallback || "accent";
}

/**
 * pickCord(base, pal, avoid, prefs) → drawcord colour: the first of `prefs` (the trim
 * first, so cords match the ribs) that reads on the base and differs from the colours
 * in `avoid` (an all-over ink), so cords never vanish into a print.
 */
function pickCord(base, pal, avoid = [], prefs = ["accent", "light", "secondary", "primary", "dark"]) {
  const B = resolveColor(base, pal);
  const avoidHex = avoid.map((a) => resolveColor(a, pal));
  let best = null, score = -1;
  for (const r of prefs) {
    if (r === base) continue;
    const C = resolveColor(r, pal);
    const far = avoidHex.every((a) => deltaE(a, C) >= 25);
    const c = contrast(B, C);
    if (far && c >= 2.5) return r;
    const s = c * (far ? 1 : 0.4);
    if (s > score) { score = s; best = r; }
  }
  return best || "accent";
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

const TRIM_PREFS = ["secondary", "primary", "accent", "light", "dark"];

/** Two-tone colourway: base + a trim that really contrasts; accent = lettering fill. */
function lettered(base, trim, pal) {
  const t = pickTrim(base, without([trim, ...TRIM_PREFS], base), pal);
  return { base, trim: t, accent: pickLettering(base, t, pal) };
}
/** Two-tone colourway for pieces whose accent colours the drawcords (cords match the trim). */
function corded(base, trim, pal, avoid = []) {
  const t = pickTrim(base, without([trim, ...TRIM_PREFS], base), pal);
  return { base, trim: t, accent: pickCord(base, pal, avoid, without([t, "accent", "light", "secondary", "primary", "dark"], base)) };
}

/** Plain two-tone colourway (accent unused on the piece, kept readable anyway). */
function twoTone(base, trim, pal) {
  const t = pickTrim(base, without([trim, ...TRIM_PREFS], base), pal);
  return { base, trim: t, accent: pickReadable(base, without(["accent", "light", "secondary", "primary", "dark"], base), pal) };
}

/**
 * quietTrim(base, pal) → a trim for tonal pieces: a team role that is a gentle step
 * off the base (contrast 1.15–2.4), else a derived shade of the base (toward the
 * primary's hue on near-black, darker otherwise). Returns a role or a hex.
 */
function quietTrim(base, pal) {
  const B = resolveColor(base, pal);
  for (const r of without(["dark", "primary", "secondary"], base)) {
    const c = contrast(B, resolveColor(r, pal));
    if (c >= 1.15 && c <= 2.4) return r;
  }
  const P = resolveColor("primary", pal);
  const toward = luminance(B) < 0.05 ? (deltaE(B, P) > 25 && luminance(P) > luminance(B) ? P : "#FFFFFF") : "#000000";
  let lo = 0, hi = 1, t = 0.3;
  for (let i = 0; i < 16; i++) { t = (lo + hi) / 2; if (contrast(B, mix(B, toward, t)) < 1.35) lo = t; else hi = t; }
  return mix(B, toward, t);
}

const RECIPES = {
  // Pro warm-up drop: giant cropped hits on two-tone pieces; game jersey keeps its numbers.
  statement: (pal) => ({
    jersey: {
      colors: lettered("primary", "secondary", pal),
      // the mascot's face sits under the number (90s-throwback style), cropped by the
      // right side panel and the hem at the jaw, eyes and muzzle clear of both; the jock
      // tag stays on bare cloth to the left of it
      front: [P("effect", "oversized", { scale: 0.7, dx: -0.03, dy: 0.08 })],
      // …and wraps round the wearer's left side to the back, under name + number
      back: [P("effect", "oversized", { scale: 0.66, dx: 0.02, dy: 0.115 })],
      text: NUMBERS,
    },
    shorts: {
      colors: corded("primary", "secondary", pal),
      // the zone is tuned so scale 1 rises out of the left leg, cropped by hem + side panel
      front: [P("effect", "oversized", { scale: 1.0 })],
      back: [P("logo", "waist-back", { scale: 1.0 })],
      text: null,
    },
    hoodie: {
      colors: corded("dark", "primary", pal),
      // the hero piece: the mascot's face cropped hard by the right armhole seam and the
      // rib band (clears the hood foot), plus the big centred back hit
      front: [P("effect", "oversized", { scale: 0.96, dx: -0.08, dy: -0.02 })],
      back: [P("effect", "back-center", { scale: 1.04, dy: -0.025 })],
      text: null,
    },
    pants: {
      colors: corded("dark", "primary", pal),
      // one giant hit running down the left leg, cropped by the outseam and inseam
      front: [P("effect", "oversized", { scale: 1.0 })],
      back: [P("logo", "back-leg", { scale: 0.95 })],
      text: null,
    },
    tee: {
      colors: twoTone("light", "primary", pal),
      // the reverse of the hoodie: a big centred front, the oversized crop on the back
      front: [P("effect", "center", { scale: 1.12, dy: 0.02 })],
      back: [P("effect", "oversized", { scale: 1.05 })],
      text: null,
    },
    longsleeve: {
      colors: lettered("secondary", "primary", pal),
      // raglan two-tone: the mascot's face cropped hard by the right side seam and hem;
      // the back stays a clean player back (name over number, two-colour twill)
      front: [P("effect", "oversized", { scale: 1.0, dx: -0.04 })],
      back: [],
      text: NUMBERS,
    },
  }),

  // Game-day staples: clean crests, numbers, one effect hit where there is room.
  classic: (pal) => ({
    jersey: {
      colors: lettered("primary", "secondary", pal),
      front: [P("logo", "chest-center", { scale: 1.0 })],
      back: [],
      text: NUMBERS,
    },
    shorts: {
      colors: corded("primary", "secondary", pal),
      front: [P("logo", "leg-left", { scale: 0.85 })],
      back: [P("logo", "waist-back", { scale: 0.85 })],
      text: null,
    },
    hoodie: {
      colors: corded("light", "primary", pal),
      front: [P("effect", "center", { scale: 0.8, dy: -0.1 })],
      // a crest between the shoulder blades: small, but it reads at thumbnail size
      back: [P("logo", "back-yoke", { scale: 1.45, dy: 0.12 })],
      text: null,
    },
    pants: {
      colors: corded("primary", "secondary", pal),
      front: [P("logo", "thigh-left", { scale: 0.9 })],
      back: [P("logo", "waist-back", { scale: 0.85 })],
      text: null,
    },
    tee: {
      colors: twoTone("secondary", "primary", pal),
      front: [P("logo", "chest-left", { scale: 0.95 })],
      back: [P("effect", "back-center", { scale: 0.92, dy: -0.04 })],
      text: null,
    },
    longsleeve: {
      // the classic baseball raglan: team colour body, contrast sleeves; small crest at
      // the nape over name + number
      colors: lettered("primary", "secondary", pal),
      front: [P("logo", "chest-center", { scale: 1.0 })],
      back: [P("logo", "back-yoke", { scale: 0.8 })],
      text: NUMBERS,
    },
  }),

  // Hero pieces in a repeat, companions solid with one hit.
  allover: (pal) => {
    const T = (extra = {}) => P("effect", "center", { mode: "tile", tile: 215, scale: 0.8, rotate: -12, ...extra });
    // one-ink repeat on the hoodie: the first team colour that reads on its base
    const hoodieInk = pickReadable("dark", ["secondary", "primary", "accent", "light"], pal, 2.2);
    const hoodieInkHex = resolveColor(hoodieInk, pal);
    return {
      // sublimated game set: the full-colour repeat on jersey + shorts
      jersey: { colors: lettered("primary", "secondary", pal), front: [T()], back: [T()], text: NUMBERS },
      shorts: { colors: corded("primary", "secondary", pal), front: [T({ tile: 190 })], back: [T({ tile: 190 })], text: null },
      // the warm-up hero: one ink on fleece, cords in a colour the print doesn't use
      hoodie: {
        colors: corded("dark", "primary", pal, [hoodieInk]),
        front: [T({ tile: 200, tint: hoodieInkHex, opacity: 0.9 })],
        back: [T({ tile: 200, tint: hoodieInkHex, opacity: 0.9 })],
        text: null,
      },
      // companions: solid pieces in the print's colours, one hit each
      pants: {
        colors: corded("primary", "dark", pal),
        front: [P("logo", "thigh-left", { scale: 0.9 })],
        back: [P("logo", "waist-back", { scale: 0.85 })],
        text: null,
      },
      tee: {
        colors: twoTone("light", "primary", pal),
        front: [P("logo", "chest-left", { scale: 1.0 })],
        back: [P("effect", "back-center", { scale: 0.8, dy: -0.06 })],
        text: null,
      },
      longsleeve: {
        colors: lettered("dark", "secondary", pal),
        front: [P("logo", "chest-left", { scale: 1.0 })],
        back: [],
        text: NUMBERS,
      },
    };
  },

  // Quiet luxury: every graphic a shade off its base, big enough to read; quiet trims;
  // lettering on the game jersey stays legible, the shooting shirt's name goes tonal.
  tonal: (pal) => {
    // quiet two-tone; drawcords (accent) take the trim colour so nothing shouts
    const quiet = (base) => { const trim = quietTrim(base, pal); return { base, trim, accent: trim }; };
    const jersey = (() => { const trim = quietTrim("primary", pal); return { base: "primary", trim, accent: pickLettering("primary", trim, pal) }; })();
    const items = {
      jersey: { colors: jersey, front: [P("effect", "oversized", { scale: 1.02, dx: 0.02 })], back: [P("effect", "back-center", { scale: 1.05, dy: 0.06 })], text: NUMBERS },
      shorts: { colors: quiet("primary"), front: [P("effect", "oversized", { scale: 1.0 })], back: [P("logo", "waist-back", { scale: 1.0 })], text: null },
      // the face cropped by the right armhole, like the statement hoodie, but tonal
      hoodie: { colors: quiet("dark"), front: [P("effect", "oversized", { scale: 0.96, dx: -0.08, dy: -0.02 })], back: [P("effect", "back-center", { scale: 1.0, dy: -0.02 })], text: null },
      pants: { colors: quiet("dark"), front: [P("effect", "oversized", { scale: 1.0 })], back: [P("logo", "back-leg", { scale: 0.95 })], text: null },
      // the light piece gets a tonal grey trim so it stays in the quiet family
      tee: { colors: { base: "light", trim: tonalTint(tonalTint(resolveColor("light", pal))), accent: pickReadable("light", ["primary", "dark", "secondary"], pal) }, front: [P("effect", "center", { scale: 1.0 })], back: [P("logo", "back-yoke", { scale: 1.5, dy: 0.14 })], text: null },
      // the name is lettered tonal too (accent = the lettering fill on this piece), outlined in the trim
      longsleeve: { colors: { ...quiet("primary"), accent: tonalTint(resolveColor("primary", pal)) }, front: [P("effect", "chest-center", { scale: 1.1, dy: 0.06 })], back: [P("effect", "oversized", { scale: 1.05 })], text: NAME_ONLY },
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
 * with resolveColors at render time) except where a recipe needs a derived shade;
 * tonal tints and all-over inks are resolved hexes.
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
