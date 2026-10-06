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
