# Mascot Lab

A website for high-school coaches and athletic directors who have a team logo but no
designer. The coach uploads the logo, sees it remixed through 23 print-shop effects
(halftone, graffiti, chrome, risograph, neon, chenille…), applies the chosen look to a
six-piece team collection (game jersey, game shorts, warm-up hoodie, warm-up pants,
practice tee, shooting shirt) and sends an order request for the roster.

Everything runs in the browser: effects are Canvas 2D image processing, garment mockups
are Canvas 2D drawings, and the logo never leaves the device until an order is sent. No
server is needed. Stack: Vite 5, React 18, plain CSS with tokens, `lucide-react`, `jszip`.

`CONTRACTS.md` is the technical spec: module shapes, the effect and garment contracts,
app state, and the design language. Read it before changing a module.

## Run it

```sh
npm install
npm run dev          # http://127.0.0.1:5199
```

The app opens with a fictional sample team (Northgate Bulldogs), clearly labelled as a
sample. Routes are bare hashes: `#home`, `#studio`, `#collection`, `#order`, `#review`,
`#done`, plus `#orders` (the site owner's order inbox).

## Build and deploy (static site)

```sh
npm run build        # → dist/
npm run preview      # serve dist/ at http://127.0.0.1:4199
```

`dist/` is a plain static site with relative asset paths and hash routing, so it works
from any host or sub-path with no rewrite rules:

- **Vercel**: framework preset Vite, build command `npm run build`, output directory `dist`.
- **Netlify**: build command `npm run build`, publish directory `dist`.
- **Any CDN or bucket**: upload the contents of `dist/`.

To receive orders on a static deploy, set `VITE_ORDER_ENDPOINT` at build time (see
[How orders flow](#how-orders-flow)). Without it, orders are saved on the coach's device
and the coach is asked to email them.

## Publish as a claude.ai Artifact

```sh
npm run build:artifact   # → dist-artifact/mascot-lab.html
```

This is one self-contained page: all JS, CSS, fonts, sample logos and the effect worker
are inlined, and the html/head/body wrapper is stripped because the Artifact host adds
its own. Publish that file as the Artifact page and declare these capabilities:

```json
{
  "downloads": {},
  "user": {},
  "db": {
    "rules": [
      { "path": "orders", "read": "owner", "write": "owner" },
      { "path": "orders/{self}", "write": "interact" }
    ]
  }
}
```

- `downloads` saves the line sheet, design pack (.zip), order sheet and roster CSV
  (`<a download>` does nothing inside the frame).
- `user` gives each viewer an id and tells the page whether the viewer is the owner.
- `db` with those rules keeps orders private: each coach can write only
  `orders/<their id>`, and only the artifact's owner can read the `orders` collection.
  The owner reads every request at `#orders`.

Inside the frame, mailto links, `window.print` and `alert/confirm/prompt` do nothing and
requests to other hosts are blocked, so the app shows addresses as copyable text and
`VITE_ORDER_ENDPOINT` is not used there.

## Where to change things

| What | Where |
| --- | --- |
| Prices, sizes, volume discounts, minimum order, lead and proof times, setup fee | `src/order/catalog.js` |
| Product name, tagline, contact email (a placeholder now), support hours, step names, page titles, shared copy | `src/brand.js` |
| Colors, type, spacing (design tokens, light and dark) | `src/styles/tokens.css` |
| Drop styles (how a look is placed across the six pieces) | `src/apparel/collection.js` |
| Sample logos | `src/assets/samples/` (`scripts/gen-samples.mjs` regenerates them) |

`CONTACT_EMAIL` in `src/brand.js` is `orders@mascotlab.example`. Replace it before
launch. The Order page's intro line mentions "24 pieces" for the first discount tier,
so check that sentence (`src/ui/pages/Order.jsx`) if you change `VOLUME_TIERS`.

### Add an effect

1. Create `src/engine/effects/<id>.js` with a default export that follows the effect
   contract in `CONTRACTS.md` (id = filename, name, category, blurb, print method,
   stage, 3–7 params, 2–4 presets, `render(src, params, ctx)`, deterministic, with a
   transparent background).
2. Add the id to `EFFECT_ORDER` in `src/engine/effects/index.js`, at its gallery position.
3. Check it on the contact sheet:
   `/harness/effects.html?effects=<id>&logos=all&perf=1`. Contract lint warnings show in
   red under the row and as `[lint]` console warnings. Fix them first.

The registry and the render worker both pick up every file in `effects/` automatically.
An effect with `stage: "dark"` (built to glow on a dark ground) moves light garments in
the collection onto dark bases.

### Add a garment

1. Create `src/apparel/garments/<id>.js`, copying `jersey.js` (the reference garment):
   front and back views with silhouette, parts, print area, the required zones, and
   overlays, on the 1000 × 1000 artboard described in `CONTRACTS.md`.
2. Add the id to `GARMENT_ORDER` in `src/apparel/garments/index.js`.
3. Add a recipe for it to each drop style in `RECIPES` in `src/apparel/collection.js`.
   Without a recipe the garment won't appear in the collection.
4. Add a product to `PRODUCTS` in `src/order/catalog.js` (name, price, sizes, and
   `fit: "top" | "bottom"`, which picks the roster size column), and a short column
   label in `SHORT_NAMES` in `src/ui/order/util.js`.
5. Check it at `/harness/garments.html?garments=<id>&style=statement&debug=zones`.

## How orders flow

`submitOrder()` in `src/order/orderService.js` tries three channels in order and
reports which one actually worked. The Done page says so truthfully: "Order request
sent" for the first two, "Saved on this device" for the third.

1. **Artifact db.** Inside claude.ai, with the capabilities above, the order is appended
   to the viewer's own document `orders/<viewer id>` as `{ orders: [...] }` (newest 10,
   under 256 KiB). An uploaded logo is stored beside it at `orders/<viewer id>/logos/…`.
   A refused write (a view-only viewer, for example) falls through to the next channel.
2. **`VITE_ORDER_ENDPOINT`.** If this is set at build time, the order is sent as
   `POST` with `Content-Type: application/json`, with a 15-second timeout. Any non-2xx
   response or a timeout falls through. The endpoint must allow the site's origin (CORS,
   including the preflight for JSON).
3. **This device.** The order is saved in `localStorage` (`mascot-lab:orders`), and the
   coach downloads the design pack and emails it to `CONTACT_EMAIL`.

What the endpoint receives is one JSON object (`schema: "mascot-lab/order@1"`):

- `ref` (for example `NB-4F7K2`), `createdAt`, `status: "requested"`, and
  `channel: "endpoint"`.
- `team` (`school`, `mascot`, `isSample`) and `logo` (`name`, `isSample`, `sampleId`, a
  small `thumb` data URL).
- `logoFile`: `{ dataUrl, width, height, name }` for an uploaded logo (SVG as is,
  otherwise PNG/WebP/JPEG up to about 200 KB), or `null` for a sample.
- `palette` (`primary`, `secondary`, `accent`, `dark`, `light` as `#RRGGBB`).
- `effect`: `id`, `name`, print `method`, `seed`, `params` (the coach's overrides),
  `resolved` (every param), and `settings` (readable lines).
- `design`: drop style id, name and note.
- `garments[]`: `id`, `name`, `styleCode`, `spec`, `fabric`, `fit`, `price`, resolved
  `colors`, readable `front`/`back` placements, `lettering`, the raw `placements`,
  `text`, and `custom`.
- `roster[]` (`name`, `number`, `top`, `bottom`, `items`), `extras`
  (`{ garmentId: { size: qty } }`), `quantities` (per garment and size), and `totals`
  (`units`, `subtotal`, `discount`, `decorationFee`, `total`, `tier`).
- `contact` (`coach`, `email`, `phone`, `school`, `address`, `needBy`, `notes`),
  `rightsConfirmed`, `replaces` (the ref of an order this one revises), `terms` (lead
  time, proof time, minimum units), and `app`.

Nothing is charged online. The order is a request: the shop sends a proof, and
production starts after the coach approves it.

## Dev harness pages

These run on the dev server and are never shipped:

- `/harness/effects.html`: a contact sheet of effects × logos, with timings, errors and
  contract lint. Example: `?effects=chrome,neon&logos=bulldog,monogram,crest&size=512`.
- `/harness/garments.html`: garment mockups × views × drop styles with a real effect
  render. Example: `?garments=hoodie&style=statement&effect=halftone&debug=zones`.
- `/harness/ui.html`: every shared component in every state. Takes
  `?theme=light|dark&team=…&open=…`.

Screenshot any page with `node scripts/shoot.mjs <url> <out.png> [--mobile] [--full] [--dark] [--ready]`.

## Tests

```sh
npm run e2e            # builds dist/, then runs the whole flow in Chromium
npm run e2e:artifact   # builds the Artifact page, then runs it in a host-like frame
                       # (strict CSP, mock window.claude with downloads, db and user)
node scripts/e2e.mjs --dist=<dir>   # test an existing build without rebuilding
```

The flow goes home → studio (gallery renders, upload the JPG fixture, change an effect)
→ collection (all six garments, switch drop style, line sheet) → order (paste a roster) →
review → send → done (a ref, the correct channel message, the design pack). Every step
must have zero console errors and no horizontal scroll at 390 px. The test exits with
code 1 on any failure. Screenshots go to `.shots/e2e/`.

In the browser, `window.__mascotLab` (`getState`, `actions`, `storageKey`) drives the
app state for scripted checks.
