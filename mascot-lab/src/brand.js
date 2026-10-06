// Mascot Lab — product name and the copy constants that appear in more than one
// place. Change the business details here (one place), not in components.

export const PRODUCT_NAME = "Mascot Lab";
export const TAGLINE = "Your logo, remixed into a full team drop.";
export const PITCH =
  "Upload your team logo, run it through print-shop effects, see it on the whole kit, and order for the roster. No designer needed.";
export const CONTACT_EMAIL = "orders@mascotlab.example"; // placeholder — replace before launch
export const SUPPORT_HOURS = "Mon–Fri, 8am–5pm CT";

/** The three-step flow shown in the header progress nav. Routes are bare hash tokens. */
export const STEPS = [
  { n: 1, id: "remix", route: "studio", label: "Remix", hint: "Pick an effect for your logo" },
  { n: 2, id: "collection", route: "collection", label: "Collection", hint: "See it on the full kit" },
  { n: 3, id: "order", route: "order", label: "Order", hint: "Sizes, roster and checkout" },
];

/** Every route the app understands (anything else falls back to home).
 *  "orders" is the site owner's order inbox; it sits outside the 3-step flow. */
export const ROUTES = ["home", "studio", "collection", "order", "review", "done", "orders"];

/** Which step a route belongs to: 0 = outside the flow (home, owner inbox), 4 = finished. */
export const ROUTE_STEP = { home: 0, studio: 1, collection: 2, order: 3, review: 3, done: 4, orders: 0 };

export const PAGE_TITLES = {
  home: "Mascot Lab — team apparel from your logo",
  studio: "Remix your logo — Mascot Lab",
  collection: "Your collection — Mascot Lab",
  order: "Order the kit — Mascot Lab",
  review: "Review your order — Mascot Lab",
  done: "Order sent — Mascot Lab",
  orders: "Order inbox — Mascot Lab",
};

export const COPY = {
  sampleTag: "Sample",
  sampleLogo: "Sample logo",
  exampleRoster: "Example roster — replace with your players",
  footerNote:
    "Mockups are previews; colours and placement are confirmed on a printed proof before production. Prices are estimates until proof approval.",
  footerSample: "Northgate Bulldogs is a fictional sample team.",
  privacy: "Your logo stays in this browser. Nothing is uploaded until you send an order.",
  logoTooBig:
    "Your uploaded logo was too large to keep on this device between visits, so the sample logo is showing. Upload it again to pick up where you left off.",
};

export const LEGAL_LINE = `© ${new Date().getFullYear()} ${PRODUCT_NAME}`;
