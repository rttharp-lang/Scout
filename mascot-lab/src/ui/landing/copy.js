// Landing page copy. Business facts (minimum, lead time, proofs, sizes, prices, tiers)
// come from src/order/catalog.js so the page never disagrees with the order flow.
import { DECORATION_FEE, LEAD_TIME, LEAD_TIME_DAYS, MIN_ORDER_UNITS, PRODUCTS, PROOF_TIME, SIZES, VOLUME_TIERS } from "../../order/catalog.js";
import { GARMENT_ORDER } from "../../apparel/garments/index.js";

export const usd = (n) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
export const pct = (f) => `${Math.round(f * 100)}%`;

/** Products in collection order (catalog entries without a garment order go last). */
export const PRODUCT_LIST = GARMENT_ORDER.map((id) => PRODUCTS[id]).filter(Boolean)
  .concat(Object.values(PRODUCTS).filter((p) => !GARMENT_ORDER.includes(p.garmentId)));
const byPrice = [...PRODUCT_LIST].sort((a, b) => a.price - b.price);
export const LOWEST = byPrice[0];

export const SIZE_RANGE = `${SIZES.youth[0]}–${SIZES.adult[SIZES.adult.length - 1]}`;

/** Volume tiers with their upper bounds: [{ min, max|null, off }]. */
export const TIERS = VOLUME_TIERS.map((t, i) => ({ ...t, max: VOLUME_TIERS[i + 1] ? VOLUME_TIERS[i + 1].min - 1 : null }));
const firstDiscount = TIERS.find((t) => t.off > 0);
const topDiscount = TIERS[TIERS.length - 1];

export const tierRange = (t) => (t.max == null ? `${t.min}+` : `${t.min}–${t.max}`);

function tierSentence() {
  const off = TIERS.filter((t) => t.off > 0);
  if (!off.length) return "";
  const parts = off.map((t, i) => (i === 0 ? `${t.min}+ pieces get ${pct(t.off)} off` : `${t.min}+ get ${pct(t.off)}`));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `Orders of ${list}.`;
}

const leadShort = LEAD_TIME.replace(/ after proof approval$/i, "");

export const HERO = {
  eyebrow: "For coaches & athletic directors",
  support:
    "Upload your team logo, pick a print-shop look, and see it on every piece of the kit before you order for the roster.",
  facts: [
    { k: "Min. order", v: `${MIN_ORDER_UNITS} pcs` },
    { k: "Proof", v: PROOF_TIME },
    { k: "Sizes", v: SIZE_RANGE },
  ],
};

export const STEPS = [
  {
    n: "01",
    title: "Remix",
    body: "Upload your logo. We cut out the background and run it through every effect at once, so you can pick the one that fits your program.",
  },
  {
    n: "02",
    title: "Collection",
    body: "Your look lands on the whole kit: game jersey, shorts, hoodie, warm-up pants, tee and shooting shirt. Change colors piece by piece.",
  },
  {
    n: "03",
    title: "Order",
    body: `Add players, numbers and sizes, choose the pieces, and send one order request. You see a proof within ${PROOF_TIME} and nothing prints until you approve it.`,
  },
];

export const AUDIENCE = [
  { id: "designer", title: "No designer on staff", body: "You have a logo and a season to run. The Studio does the layout and the effects." },
  { id: "budget", title: "Tight budget", body: `Per-piece prices include the decoration${DECORATION_FEE ? "" : " with no setup fee"}, and the whole order gets cheaper at ${firstDiscount ? firstDiscount.min : 24} pieces.` },
  { id: "boosters", title: "Booster clubs", body: "Add coach, staff and family gear to the same request as the team kit." },
  { id: "store", title: "Team stores", body: "Reuse the same artwork for a spirit-wear sale or a reorder next season." },
];

export const INCLUDED = [
  "Your logo remixed in every effect, at print resolution",
  "Mockups of each piece, front and back, in your colors",
  `A proof of every piece within ${PROOF_TIME}`,
  "One order sheet: players, numbers, sizes and pieces",
];

export const FAQ = [
  {
    q: "Do I need a vector file?",
    a: "No. A PNG, JPG, WebP, GIF or SVG works. A file around 1000 px or larger on its long side gives the cleanest print. If your logo is too small or blurry to print well, we tell you on the proof.",
  },
  {
    q: "My logo has a white box around it. Is that a problem?",
    a: "No. When you upload, Mascot Lab finds the plain background and cuts it out, and it keeps the white inside the mascot, like eyes and teeth. If it trims too much or too little, adjust the cut-out in the Studio or turn it off.",
  },
  {
    q: "Can I use my school's official logo?",
    a: "Yes, as long as your school or district lets you use it. You confirm that you have the rights when you send the order. If you are not sure, check with your athletic director or district communications office first.",
  },
  {
    q: "How do proofs work?",
    a: `After you send the order request, we send a proof of every piece within ${PROOF_TIME}: colors, placements, names and numbers. Reply with changes or approve it. Nothing prints until you approve.`,
  },
  {
    q: "What sizes can we order?",
    a: `Youth ${SIZES.youth.join(", ")} and adult ${SIZES.adult.join(", ")} on every piece. Mix sizes freely in one order, and pick separate top and bottom sizes for each player.`,
  },
  {
    q: "How long does it take?",
    a: `Proofs take ${PROOF_TIME}. Production takes ${leadShort} after you approve the proof, so send your request at least ${Math.ceil((LEAD_TIME_DAYS || 28) / 7) + 1} weeks before you need the gear.`,
  },
  {
    q: "Can we reorder later?",
    a: "Yes. Your logo, look and collection stay saved in this browser. Come back, update the roster, and send a new request. Keep the order reference from your confirmation so we can match the colors.",
  },
  {
    q: "What does it cost?",
    a: `Pieces start at ${usd(LOWEST.price)} for a ${LOWEST.name.toLowerCase()}, decoration included, and the minimum order is ${MIN_ORDER_UNITS} pieces. ${tierSentence()} Your final price is on the proof.`,
  },
];

export const FACTS = {
  min: `${MIN_ORDER_UNITS} pieces`,
  proof: PROOF_TIME,
  lead: LEAD_TIME,
  sizes: SIZES,
  topOff: pct(topDiscount.off),
};
