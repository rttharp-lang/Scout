// Mascot Lab — order quantities and totals. Pure functions of the app state
// (no React, no DOM), so the Order page, the Review sheet, the order service and
// the self-check script all compute the same numbers.
//
//   quantities(state, opts?) → { [garmentId]: { [size]: n, total } }
//   totals(state, opts?)     → { units, subtotal, discount, decorationFee, total, tier,
//                                lines, nextTier, meetsMinimum, minUnits, unsized,
//                                players, kitPrice }
//   nextTier(units)          → { min, off, need } | null
//
// Rules:
// - A garment is in the order when its collection item is `enabled` and it has a
//   product in the catalog. `opts.garmentIds` narrows that to the garments the page
//   can actually show (the registry may not have loaded every file yet).
// - Each roster row gets every order garment unless `row.items[garmentId] === false`.
//   Tops use the row's `top` size, bottoms its `bottom` size (PRODUCTS[].fit).
//   A missing/unknown size is counted under UNSIZED ("TBD") so the units and money
//   stay right while the coach finishes the sizes.
// - Completely blank rows (no name, number or sizes) are ignored, like the empty
//   line at the bottom of a spreadsheet.
// - Extras: { [garmentId]: { [size]: qty } }, added for order garments only.
// - The volume tier discount applies to the whole order (all units, all garments).
import { DECORATION_FEE, MIN_ORDER_UNITS, PRODUCTS, VOLUME_TIERS, isSize } from "./catalog.js";

export const UNSIZED = "TBD";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const str = (v) => (v == null ? "" : String(v)).trim();

/** isBlankRow(row) → true when a roster row has nothing in it yet. */
export function isBlankRow(row) {
  if (!row || typeof row !== "object") return true;
  return !str(row.name) && !str(row.number) && !str(row.top) && !str(row.bottom);
}

/** countedRows(roster) → the rows that count toward the order. */
export function countedRows(roster) {
  return (Array.isArray(roster) ? roster : []).filter((r) => !isBlankRow(r));
}

/**
 * orderGarmentIds(state, { garmentIds? }) → garment ids in the order, in catalog
 * order (jersey, shorts, hoodie, pants, tee, longsleeve).
 */
export function orderGarmentIds(state, { garmentIds } = {}) {
  const items = state?.collection?.items || {};
  const allow = Array.isArray(garmentIds) ? new Set(garmentIds) : null;
  return Object.keys(PRODUCTS).filter((id) => items[id]?.enabled && (!allow || allow.has(id)));
}

/** rowIncludes(row, garmentId) → true unless the row's checkbox for it is off. */
export function rowIncludes(row, garmentId) {
  return !(row?.items && row.items[garmentId] === false);
}

/** quantities(state, opts?) → { [garmentId]: { [size]: n, total } } for every order garment. */
export function quantities(state, opts = {}) {
  const ids = orderGarmentIds(state, opts);
  const out = {};
  for (const id of ids) out[id] = { total: 0 };
  for (const row of countedRows(state?.roster)) {
    for (const id of ids) {
      if (!rowIncludes(row, id)) continue;
      const size = isSize(row[PRODUCTS[id].fit]) ? row[PRODUCTS[id].fit] : UNSIZED;
      out[id][size] = (out[id][size] || 0) + 1;
      out[id].total += 1;
    }
  }
  const extras = state?.extras && typeof state.extras === "object" ? state.extras : {};
  for (const id of ids) {
    const bySize = extras[id];
    if (!bySize || typeof bySize !== "object") continue;
    for (const [size, qty] of Object.entries(bySize)) {
      const n = Math.max(0, Math.floor(Number(qty) || 0));
      if (!n || !isSize(size)) continue;
      out[id][size] = (out[id][size] || 0) + n;
      out[id].total += n;
    }
  }
  return out;
}

/** extrasUnits(extras, garmentIds?) → total extra pieces (optionally only for some garments). */
export function extrasUnits(extras, garmentIds) {
  let n = 0;
  const allow = Array.isArray(garmentIds) ? new Set(garmentIds) : null;
  for (const [id, bySize] of Object.entries(extras || {})) {
    if (allow && !allow.has(id)) continue;
    for (const [size, q] of Object.entries(bySize || {})) if (isSize(size)) n += Math.max(0, Math.floor(Number(q) || 0));
  }
  return n;
}

/** tierFor(units) → the VOLUME_TIERS entry that applies (the first tier for 0 units). */
export function tierFor(units) {
  let t = VOLUME_TIERS[0];
  for (const tier of VOLUME_TIERS) if (units >= tier.min) t = tier;
  return t;
}

/** nextTier(units) → { min, off, need } for the next bigger discount, or null at the top tier. */
export function nextTier(units) {
  const u = Math.max(0, Math.floor(Number(units) || 0));
  const cur = tierFor(u);
  const next = VOLUME_TIERS.find((t) => t.min > u && t.off > cur.off);
  return next ? { min: next.min, off: next.off, need: next.min - u } : null;
}

/** totals(state, opts?) → the money for the whole order (see the header for the shape). */
export function totals(state, opts = {}) {
  const ids = orderGarmentIds(state, opts);
  const q = quantities(state, opts);
  const lines = ids.map((id) => {
    const p = PRODUCTS[id];
    const units = q[id]?.total || 0;
    return { garmentId: id, name: p.name, price: p.price, units, amount: round2(units * p.price) };
  });
  const units = lines.reduce((a, l) => a + l.units, 0);
  const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0));
  const tier = tierFor(units);
  const discount = round2(subtotal * tier.off);
  const decorationFee = units > 0 ? round2(DECORATION_FEE) : 0;
  const total = round2(subtotal - discount + decorationFee);
  const unsized = ids.reduce((a, id) => a + (q[id]?.[UNSIZED] || 0), 0);
  return {
    units,
    subtotal,
    discount,
    decorationFee,
    total,
    tier: { ...tier },
    lines,
    nextTier: nextTier(units),
    meetsMinimum: units >= MIN_ORDER_UNITS,
    minUnits: MIN_ORDER_UNITS,
    unsized,
    players: countedRows(state?.roster).length,
    kitPrice: round2(ids.reduce((a, id) => a + PRODUCTS[id].price, 0)),
  };
}

const MONEY = typeof Intl !== "undefined" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }) : null;
const MONEY0 = typeof Intl !== "undefined" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : null;

/** formatMoney(n) → "$1,234" for whole dollars, "$1,234.50" otherwise. */
export function formatMoney(n) {
  const v = round2(n || 0);
  if (!MONEY) return `$${v.toFixed(2)}`;
  return Number.isInteger(v) ? MONEY0.format(v) : MONEY.format(v);
}

/** formatPercent(0.05) → "5%". */
export function formatPercent(off) {
  return `${Math.round((Number(off) || 0) * 100)}%`;
}

/** tierHint(units) → "Add 6 more items to save 10%." or null at the top tier. */
export function tierHint(units) {
  const n = nextTier(units);
  if (!n) return null;
  return `Add ${n.need} more ${n.need === 1 ? "item" : "items"} to save ${formatPercent(n.off)}.`;
}
