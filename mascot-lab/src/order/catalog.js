// Products, prices and ordering rules — the one place the site owner edits them.
// Prices are placeholders (USD per unit, decoration included).

export const SIZES = {
  youth: ["YS", "YM", "YL", "YXL"],
  adult: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
};
export const ALL_SIZES = [...SIZES.youth, ...SIZES.adult];

export const PRODUCTS = {
  jersey:     { garmentId: "jersey",     name: "Game Jersey",    price: 46, sizes: ALL_SIZES, fit: "top" },
  shorts:     { garmentId: "shorts",     name: "Game Shorts",    price: 36, sizes: ALL_SIZES, fit: "bottom" },
  hoodie:     { garmentId: "hoodie",     name: "Warm-up Hoodie", price: 62, sizes: ALL_SIZES, fit: "top" },
  pants:      { garmentId: "pants",      name: "Warm-up Pants",  price: 54, sizes: ALL_SIZES, fit: "bottom" },
  tee:        { garmentId: "tee",        name: "Practice Tee",   price: 24, sizes: ALL_SIZES, fit: "top" },
  longsleeve: { garmentId: "longsleeve", name: "Shooting Shirt", price: 32, sizes: ALL_SIZES, fit: "top" },
};

// Discount applies to the whole order once total units reach `min`.
export const VOLUME_TIERS = [
  { min: 1, off: 0 },
  { min: 24, off: 0.05 },
  { min: 48, off: 0.1 },
  { min: 96, off: 0.15 },
];

export const MIN_ORDER_UNITS = 12;
export const LEAD_TIME = "3–4 weeks after proof approval";
export const LEAD_TIME_DAYS = 28; // used to sanity-check "need by" dates
export const PROOF_TIME = "2 business days";

/* ── Extensions (additive) ─────────────────────────────────────────────── */

/** Proof turnaround in business days (PROOF_TIME in numbers, for date maths). */
export const PROOF_BUSINESS_DAYS = 2;
/** Upper end of LEAD_TIME in days (the "4 weeks"), for ship-date estimates. */
export const LEAD_TIME_MAX_DAYS = 28;
/** Lower end of LEAD_TIME in days (the "3 weeks"). */
export const LEAD_TIME_MIN_DAYS = 21;
/** Flat per-order art/setup fee in USD. 0 = decoration is included in the unit prices. */
export const DECORATION_FEE = 0;
/** Currency shown everywhere prices appear. */
export const CURRENCY = "USD";

/** Size groups in display order, for selects and size tables. */
export const SIZE_GROUPS = [
  { id: "youth", label: "Youth", sizes: SIZES.youth },
  { id: "adult", label: "Adult", sizes: SIZES.adult },
];

/** productFor(garmentId) → product or null. */
export function productFor(garmentId) {
  return PRODUCTS[garmentId] || null;
}

/** isSize(value) → true when `value` is one of the catalog sizes. */
export function isSize(value) {
  return ALL_SIZES.includes(value);
}
