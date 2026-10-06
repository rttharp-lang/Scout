// Collection page — small formatting helpers.

/** formatPrice(46) → "$46"; formatPrice(46.5) → "$46.50". */
export function formatPrice(n) {
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

/** plural(3, "piece") → "3 pieces". */
export function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

/** slug("Northgate Bulldogs") → "northgate-bulldogs". */
export function slug(s, fallback = "team") {
  const out = String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return out || fallback;
}

/** "Northgate Bulldogs" from the team, or "Your team". */
export function teamName(team) {
  return [team?.school, team?.mascot].map((s) => String(s || "").trim()).filter(Boolean).join(" ") || "Your team";
}

/** Percent readout: 1.12 → "112%". */
export const pct = (v) => `${Math.round(v * 100)}%`;

/** Signed percent readout for offsets: 0.05 → "+5%", -0.1 → "−10%". */
export const signedPct = (v) => {
  const n = Math.round(v * 100);
  return n === 0 ? "0%" : `${n > 0 ? "+" : "−"}${Math.abs(n)}%`;
};

/** Degrees readout: -12 → "−12°". */
export const deg = (v) => {
  const n = Math.round(v);
  return n === 0 ? "0°" : `${n > 0 ? "" : "−"}${Math.abs(n)}°`;
};

/** Words of a title, so "Warm-up Hoodie" never breaks after the hyphen (see Title.jsx). */
export function titleWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean);
}
