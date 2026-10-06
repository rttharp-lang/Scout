# Mascot Lab — build contracts

Mascot Lab is a website for high-school coaches and athletic directors who have a
team logo but no designer. The coach uploads the logo (e.g. a bulldog mascot),
sees it remixed through a gallery of graphic effects (halftone, graffiti, chrome,
risograph, neon, chenille…, in the spirit of Studio 2am's Photoshop effect packs),
picks one, sees it applied across a full team apparel collection (game jersey,
shorts, hoodie, pants, tee, long-sleeve shooting shirt) in the spirit of Nike's
NBA "Standard Issue / Worn with Obsession" drop (bold oversized graphics on
two-tone warm-up gear, plus understated pieces), then orders the whole kit for
the roster.

Everything runs client-side: effects are Canvas 2D image processing, mockups are
Canvas 2D drawings. No server is required. This file is the source of truth for
how the modules fit together. **If you own a module, implement its contract
exactly; if you consume one, rely only on what is written here.** If a contract is
genuinely wrong, implement the closest working thing and report the deviation in
your final message — do not silently change shapes other modules rely on.

Stack: Vite 5 + React 18 (JSX, no TypeScript), plain CSS with custom properties,
`lucide-react` icons, `jszip`. No other runtime deps. Do not `npm install`
anything new without saying so in your report.

## Directory map

```
mascot-lab/
  CONTRACTS.md            ← this file
  index.html              app entry
  harness/                dev-only test pages (never shipped)
    effects.html/.js      contact sheet: effects × logos, timings, errors
    garments.html/.js     garment mockups × views × placements
  scripts/
    shoot.mjs             screenshot any URL with Chromium (see "Looking at your work")
    e2e.mjs               end-to-end flow test (integration phase)
    build-artifact.mjs    post-processes the single-file build into an Artifact page
  src/
    main.jsx, App.jsx, brand.js
    styles/               tokens.css, global.css
    platform/             claude.js (runtime capabilities), storage.js, files.js (saveFile)
    state/                store.jsx (React context + reducer + persistence)
    engine/
      core.js             pixel/mask/noise/color helpers shared by all effects
      image.js            load, background removal, trim, palette extraction, square source
      render.js           param resolution, render cache, progressive render queue
      effects/
        index.js          registry + categories (glob-loaded, failure-tolerant)
        <id>.js           one effect per file, default export (contract below)
    apparel/
      renderMockup.js     draws one garment view with colors + graphics + text
      textures.js         fabric textures (mesh, fleece, knit, woven)
      collection.js       drop styles (placement recipes) + buildCollection()
      garments/
        index.js          registry (glob-loaded, failure-tolerant)
        <id>.js           one garment per file, default export (contract below)
    order/
      catalog.js          products, prices, size runs, volume tiers, lead time
      pricing.js          quantities + totals from roster/extras
      orderService.js     submit adapters (artifact db → endpoint → local)
      orderSheet.js       order summary: text, CSV roster, HTML order sheet
    ui/
      components/         shared UI primitives
      pages/              Landing, Studio, Collection, Order, Review/Done
    assets/samples/       sample logos (+ index.js)
```

## Sample team (used everywhere a default is needed)

`Northgate Bulldogs` (fictional). Colors: primary navy `#13294B`, secondary
athletic gold `#F2A900`, accent white `#FFFFFF`, dark `#0B0D10`, light `#F4F5F7`.
The app opens with this sample loaded and clearly labelled "Sample logo".

## Palette

```js
palette = { primary, secondary, accent, dark, light }   // all "#RRGGBB" uppercase
```
Color *roles* used in params and colorways are the keys of `palette`:
`"primary" | "secondary" | "accent" | "dark" | "light"`, or a literal `"#RRGGBB"`.

## Effects

### The source image every effect receives

`src` is an `HTMLCanvasElement`, square `S×S`, transparent background, with the
logo trimmed and fitted (contain) inside the **central 72%** (`SAFE = 0.72`,
14% margin each side) and centered. The margin is room for outlines, glow,
drips and drop shadows. Built by `image.makeSource(logoCanvas, S)`.

### Effect module (`src/engine/effects/<id>.js`, default export)

```js
export default {
  id: "halftone",              // must equal the filename
  name: "Halftone",            // display name, ≤ 16 chars
  category: "print",           // "print" | "street" | "metal" | "retro" | "digital"
  blurb: "Comic-era dot screen in your team ink.",   // ≤ 60 chars, plain English
  method: "Screen print",      // how it would be produced on apparel:
                               // "Screen print" | "Sublimation" | "Embroidery" |
                               // "Chenille patch" | "Heat transfer" | "Puff print"
  stage: "paper",              // gallery card backdrop: "paper" | "dark" | "mid" | "team"
  params: [ /* ParamSpec[] — 3 to 7 controls, the ones a coach would actually touch */ ],
  presets: [ { name: "Comic", params: { /* partial */ } } ],  // 2–4 named looks, first = default look
  render(src, p, ctx) { /* … */ return canvas; },              // may return a Promise<canvas>
};
```

ParamSpec:
```js
{ key, label, type: "range", min, max, step, default, unit? }   // unit e.g. "px", "°", "%"
{ key, label, type: "color", default: "primary" | "secondary" | "accent" | "dark" | "light" | "#RRGGBB" }
{ key, label, type: "select", options: [{ value, label }], default }
{ key, label, type: "toggle", default: true | false }
```
Pixel-like ranges are expressed **in units at S = 1024** and the effect multiplies
by `ctx.scale` — so a 384px gallery preview and a 2048px export look identical
apart from resolution.

`render(src, p, ctx)`:
- `p` — resolved params: every key present, colors as `"#RRGGBB"`, numbers clamped.
- `ctx = { size: S, scale: S / 1024, palette, seed, quality: "preview" | "final" }`.
- Returns a **new** `S×S` canvas. Never mutate `src`.
- **Transparent background** — only the artwork (and its intentional halo, drips,
  glow, shadow, sticker border…) is painted, so the result can be printed on a
  garment of any color. The artwork may use the margin; nothing may be cut off at
  the canvas edge for typical logos at default params.
- **Deterministic**: same inputs → same pixels. Use `rng(seed)` / `makeNoise2D(seed)`
  from core.js, never `Math.random()`.
- **Robust to any logo**: multi-color mascots, single-color marks, thin line art,
  white-on-transparent logos, small/large/wide/tall logos, logos with holes.
- **Uses the team palette by default** (color params default to roles).
- **Performance budget** (Chromium, this container): S=384 ≤ 150 ms,
  S=1024 ≤ 1500 ms, S=2048 ≤ 6 s. `quality: "preview"` may cut corners
  (fewer particles, cheaper blur) if it still looks the same.
- Must look **professionally designed** — like a paid Photoshop effect pack, not a
  tech demo. Judge it visually (see "Looking at your work") on the bulldog, the
  monogram and the crest before calling it done.

### Registry (`src/engine/effects/index.js`)

```js
export const CATEGORIES = [
  { id: "print",   label: "Print shop" },
  { id: "street",  label: "Street" },
  { id: "metal",   label: "Chrome & light" },
  { id: "retro",   label: "Varsity & craft" },
  { id: "digital", label: "Digital" },
];
export const EFFECT_ORDER = [/* effect ids in gallery order; unknown ids sort after, by name */];
export async function loadEffects(): Promise<Effect[]>  // memoized
export async function getEffect(id): Promise<Effect | null>
```
`loadEffects` uses `import.meta.glob("./*.js")` (lazy, excluding index.js),
loads every module with `Promise.allSettled`, skips (and `console.warn`s) any
module that fails to load or fails validation, and sorts by `EFFECT_ORDER`.
`original.js` is the pass-through "Clean" effect (logo as-is) and is always first.

### render.js

```js
export const SAFE = 0.72;
export function defaultParams(effect): object
export function resolveParams(effect, params, palette): object   // defaults + role→hex + clamp
export function renderEffect(effect, logoCanvas, params, palette,
                             { size = 1024, seed = 7, quality = "final", logoKey }): Promise<HTMLCanvasElement>
   // builds/caches makeSource(logoCanvas, size), resolves params, calls effect.render,
   // LRU-caches the result (key: logoKey|id|params|palette|size|seed|quality), never throws
   // synchronously — rejects with an Error whose message names the effect.
export function createRenderQueue(): {
  enqueue(key, job: () => Promise<any>, priority = 0): Promise<any>,  // one job at a time, yields to the
  cancel(predicate?): void,                                            // event loop between jobs; higher
}                                                                      // priority first; duplicate keys share a promise
export function canvasToBlob(canvas, type = "image/png", quality?): Promise<Blob>
```

### core.js (helpers every effect may use)

Canvas: `createCanvas(w, h = w)`, `ctx2d(canvas)` (willReadFrequently), `cloneCanvas(c)`.
Random: `rng(seed) → () => [0,1)` (mulberry32), `hashSeed(...parts) → uint32`.
Noise: `makeNoise2D(seed) → (x, y) => [-1, 1]` (smooth gradient/simplex noise),
`fbm(noise2D, x, y, octaves = 4, lacunarity = 2, gain = 0.5)`.
Color: `hexToRgb`, `rgbToHex`, `rgbToHsl`, `hslToRgb`, `mix(hexA, hexB, t)`,
`lighten(hex, amt)`, `darken(hex, amt)`, `luminance(hex)` (relative, 0–1),
`contrastText(hex) → "#000000" | "#FFFFFF"`, `saturate(hex, amt)`.
Masks (`Float32Array` of w·h in 0–1): `alphaMask(canvas)`, `maskToCanvas(mask, w, h, color)`,
`distanceField(mask, w, h, threshold = 0.5) → { inside, outside }` (exact Euclidean,
px), `dilateMask(mask, w, h, r)`, `erodeMask(mask, w, h, r)` (anti-aliased edges),
`blurMask(mask, w, h, r)` (≈gaussian, 3× box), `blurCanvas(canvas, r) → canvas`,
`luminanceMap(canvas) → Float32Array`, `heightFromMask(mask, w, h, bevel) → Float32Array`
(smooth rounded "pillow" height, 0..1), `normalsFromHeight(height, w, h, strength) → { nx, ny, nz }`,
`traceContours(mask, w, h, threshold = 0.5, simplify = 1) → Array<Array<[x, y]>>`
(closed polylines, marching squares, outer and hole contours).
Compositing: `tintCanvas(canvas, hex)`, `applyGradientMap(canvas, stops)` where
`stops = [{ at: 0..1, color: "#hex" }]` (maps luminance, keeps alpha),
`clipToMask(canvas, maskCanvas)`, `posterize(canvas, levels)`,
`quantizeToPalette(canvas, hexes)`, `compose(dst, src, { op, alpha, x, y })`.

### image.js

```js
export async function loadImageFromFile(file: File): Promise<HTMLCanvasElement>   // png/jpg/webp/gif/svg; SVG rasterized at 2048 long side
export async function loadImageFromUrl(url): Promise<HTMLCanvasElement>
export function hasTransparency(canvas): boolean
export function removeBackground(canvas, tolerance = 28): { canvas, removed: boolean }
   // flood-fill from the border through pixels close to the dominant border color,
   // feathered edge; removed=false if the border isn't a near-uniform color
export function trimTransparent(canvas, alphaThreshold = 8): HTMLCanvasElement
export async function prepareLogo(input: File | string | HTMLCanvasElement,
                                  { removeBg = "auto", tolerance = 28, maxSide = 1600 } = {})
   : Promise<{ canvas, bgRemoved: boolean, hadAlpha: boolean, width, height }>
export function makeSource(logoCanvas, size): HTMLCanvasElement   // square S×S, logo in central SAFE box
export function extractPalette(canvas, k = 6): Array<{ hex, weight }>
export function suggestPalette(canvas): palette   // primary = most prominent saturated color, etc.
export function canvasToDataURL(canvas, maxSide = 1024): string
```

## Garments

All garment geometry lives on a **1000 × 1000 artboard** (y down). The garment
silhouette fits inside x ∈ [40, 960], y ∈ [30, 970], centered, as large as its
proportions allow. Style: clean **technical flat** (the way pro uniform builders
draw garments): accurate proportions, real construction (raglan or set-in seams,
side panels, rib collars, cuffs, waistbands, hems, drawcords, pocket bags,
binding), soft fold shading, crisp seams and twin-needle stitching. It must read
instantly as a premium basketball garment at 300px and hold up at 1600px.

### Garment module (`src/apparel/garments/<id>.js`, default export)

```js
export default {
  id: "jersey",                    // filename
  name: "Game Jersey",             // display name
  styleCode: "ML-J01",             // spec-sheet code shown in UI
  category: "uniform" | "warmup",
  fabric: "mesh" | "fleece" | "knit" | "woven",   // renderer texture
  spec: "Sublimated poly mesh · reversible-ready · 160 gsm",   // one line, real-sounding
  views: { front: View, back: View },
  defaultColors: { base: "primary", trim: "secondary", accent: "accent" },  // roles
};
View = {
  silhouette: "M…Z",              // SVG path data: full outer outline (shadow, outline stroke, master clip)
  parts: [ { id, d, fill } ],     // painted in order; fill = "base"|"trim"|"accent"|"white"|"black"|"#hex"
                                  //   (body, side panels, collar rib, armhole binding, waistband,
                                  //    cuffs, hood lining, pocket, drawcords, labels…)
  printArea: "M…Z",               // where a graphic may print (body panels, not ribs/binding);
                                  //   may be one path with several subpaths
  zones: { [zoneId]: { x, y, w, h, label } },   // placement boxes (artboard units)
  overlays: [ { d, kind, opacity?, width? } ],  // drawn ABOVE graphics, in order. kind:
                                  //   "seam" (thin dark line) | "stitch" (dashed twin-needle) |
                                  //   "rib" (ribbing texture, d is the rib region) |
                                  //   "shadow" (soft dark fold, d is a filled region) |
                                  //   "highlight" (soft light fold, filled region) | "edge" (inner edge shade)
  text?: { name?: { x, y, w, h }, number?: { x, y, w, h } },   // jersey/shooting shirt lettering boxes
};
```

Required zone ids (a garment may add more):
- tops (jersey, tee, longsleeve, hoodie) front: `chest-left`, `chest-center`,
  `center`, `oversized`; back: `back-yoke`, `back-center`, `oversized`.
  `oversized` deliberately extends past the garment edges so the graphic crops.
- hoodie also: `hood` (side of hood, front view) and `pouch` (kangaroo pocket).
- shorts front: `leg-left`, `leg-right`, `oversized`; back: `back-leg`, `waist-back`.
- pants front: `thigh-left`, `leg-left-long` (vertical, hip to knee), `leg-right-long`,
  `oversized`; back: `back-leg`, `waist-back`.

### Garment registry (`src/apparel/garments/index.js`)

```js
export const GARMENT_ORDER = ["jersey", "shorts", "hoodie", "pants", "tee", "longsleeve"];
export async function loadGarments(): Promise<Garment[]>   // glob, allSettled, validates, memoized
export async function getGarment(id): Promise<Garment | null>
```

### renderMockup.js

```js
export function renderMockup(garment, viewId, {
  size = 800,                          // output px (square canvas)
  colors,                              // { base, trim, accent } resolved "#RRGGBB"
  graphics = [],                       // Placement[] (below), drawn in order, clipped to printArea
  text = null,                         // { name, number, fill, outline } or null
  backdrop = null,                     // null = transparent, or "#hex"
  shadow = true,                       // soft drop shadow under the garment
  detail = "full",                     // "full" | "fast" (fast = skip fabric texture)
}): HTMLCanvasElement
Placement = {
  canvas,                // effect output (S×S, logo in the central SAFE box)
  zone,                  // zone id on this view
  scale = 1,             // 1 = the SAFE box fits the zone (contain)
  dx = 0, dy = 0,        // offset as a fraction of zone width/height
  rotate = 0,            // degrees
  mode = "single",       // "single" | "tile" (all-over, brick repeat across printArea)
  tile = 220,            // tile size in artboard units (tile mode)
  opacity = 1,
  tint = null,           // "#hex" → graphic recolored to one flat color (tonal/understated looks)
  blend = "normal",      // "normal" | "multiply" | "screen"
}
export function fontsReady(): Promise<void>   // resolves when the lettering font is loaded
```
Draw order: shadow → parts (filled by role) → graphics (clipped to printArea, and
to the silhouette) → text (lettering font "Graduate", fill + outline) → fabric
texture (multiply, clipped to silhouette) → overlays → silhouette outline stroke.
Must be fast: size 600, detail "full" ≤ 60 ms; size 1600 ≤ 400 ms.

### collection.js

```js
export const DROP_STYLES = [   // ids fixed; copy may be improved
  { id: "statement", name: "Statement", blurb: "Oversized hits that crop off the edge. The warm-up look." },
  { id: "classic",   name: "Classic",   blurb: "Chest crests, numbers, clean back hits." },
  { id: "allover",   name: "All-over",  blurb: "Your graphic as a repeat print, edge to edge." },
  { id: "tonal",     name: "Tonal",     blurb: "Graphic printed a shade off the base. Understated." },
];
export function buildCollection(dropStyleId, palette): Collection
Collection = {
  dropStyle,
  items: { [garmentId]: {
    enabled: true,
    colors: { base: role|hex, trim: role|hex, accent: role|hex },
    front: PlacementSpec[], back: PlacementSpec[],      // Placement minus `canvas`; plus `source`:
                                                        //   "effect" (the chosen effect render) |
                                                        //   "logo" (clean logo) — lets a style mix
                                                        //   a clean chest crest with an effect back hit
    text: { name: true|false, number: true|false } | null,
  } },
};
export function resolveColors(colors, palette): { base, trim, accent }   // roles → hex
```
Two-tone is the default language: each garment's base/trim come from the team
palette so the set reads as one collection (e.g. hoodie in dark, pants in primary).

## Order

`catalog.js`:
```js
export const SIZES = { youth: ["YS","YM","YL","YXL"], adult: ["XS","S","M","L","XL","2XL","3XL"] };
export const PRODUCTS = { [garmentId]: { garmentId, name, price /* USD per unit */, sizes: [...], fit: "top"|"bottom" } };
export const VOLUME_TIERS = [ { min: 1, off: 0 }, { min: 24, off: 0.05 }, { min: 48, off: 0.1 }, { min: 96, off: 0.15 } ];
export const MIN_ORDER_UNITS = 12; export const LEAD_TIME = "3–4 weeks after proof approval";
```
Prices are placeholders the site owner edits in one place.

`pricing.js`: `quantities(state) → { [garmentId]: { [size]: n, total } }`,
`totals(state) → { units, subtotal, discount, decorationFee, total, tier }`.
Roster rows: `{ id, name, number, top: size, bottom: size, items: { [garmentId]: bool } }`;
extras (coaches/staff/fans): `{ [garmentId]: { [size]: qty } }`.

`orderService.js`: `submitOrder(order) → Promise<{ ok, channel: "artifact-db" | "endpoint" | "local", ref, message }>`.
Tries the claude.ai artifact `db` capability, then `import.meta.env.VITE_ORDER_ENDPOINT`
(POST JSON), else stores locally. The UI must tell the truth about which one
happened ("Order request sent" vs "Saved on this device — send it to us").

## Platform (claude.ai Artifact runtime) — `src/platform/claude.js`

When published as an Artifact the page runs in a sandboxed frame: `<a download>`
and `window.print()` do nothing, forms can't post anywhere, `alert/confirm/prompt`
are no-ops, only bare `#token` hashes survive. So:
- `getCapability(name)` → `window.claude?.use?.(name) ?? null` (await; null when absent; never throws).
- `saveFile(filename, blobOrString)` (in `platform/files.js`): tries the `downloads`
  capability (`(await claude.use("downloads")).save({ filename, data })`), and falls
  back to an `<a download>` click outside the Artifact frame. Returns
  `{ ok, how: "downloads" | "anchor", error? }`. Allowed extensions there:
  png, jpg, svg, zip, csv, json, html, txt, pdf.
- Never use `alert/confirm/prompt/window.print`; build confirmations into the UI.
- Routing uses bare hash tokens only: `#home`, `#studio`, `#collection`, `#order`, `#review`, `#done`.
- `localStorage` access always in try/catch (`platform/storage.js`); the app must
  work when it throws or comes back empty.

## App state (`src/state/store.jsx`)

```js
{
  team:      { school: "Northgate", mascot: "Bulldogs", isSample: true },
  logo:      { dataUrl, name, bgRemoved, tolerance, key },   // key = hash for render caches
  palette:   { primary, secondary, accent, dark, light },
  effect:    { id: "graffiti", params: {}, seed: 7 },        // params: overrides only
  favorites: [effectId],
  collection: Collection,                                   // from buildCollection()
  roster:    [RosterRow], extras: {…},
  contact:   { coach, email, phone, school, address, needBy, notes },
  order:     { status: "draft" | "submitted", ref, channel, submittedAt } ,
}
```
Exposed via `useStore() → { state, dispatch, actions }` with named action helpers
(`setLogo`, `setPalette`, `setEffect`, `setEffectParams`, `toggleFavorite`,
`setDropStyle`, `updateItem`, `setRoster`, `setExtras`, `setContact`, `markSubmitted`, `reset`).
Persisted to localStorage (debounced, try/catch) under `mascot-lab:v1`.
`useLogoCanvas()` returns the decoded logo canvas (memoized by `logo.key`).

## Design language

Subject: an equipment room crossed with a screen-print shop's spec sheet. The
**team's colors are the accent** (CSS vars `--team-1/2/3`, set from the palette at
runtime); the UI chrome around them is quiet so the effects and garments carry
the color. Light theme on "gym white" (cool, slightly blue-grey neutrals — not
cream), full dark theme via tokens. Type: **Big Shoulders Display** (800/900,
uppercase, tight) for display; **Archivo** for body/UI; **IBM Plex Mono** (500,
uppercase, letter-spaced, small) for spec-sheet labels (style codes, sizes, hex
codes, print methods); **Graduate** only for jersey lettering. Fonts are
self-hosted via `@fontsource/*` imports (never Google Fonts links). Tokens live in
`src/styles/tokens.css`; components use tokens only. Must work at 390px wide with
no horizontal scroll, keyboard focus visible, `prefers-reduced-motion` respected.

## Looking at your work (mandatory for anything visual)

A dev server runs at `http://127.0.0.1:5199/` (Vite, hot reload). If
`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5199/` is not 200, start it
in the background from `mascot-lab/`: `npm run dev > /tmp/vite-5199.log 2>&1 &`
(strictPort: if another agent already started it, yours exits — that's fine).

Screenshot, then **open the PNG with the Read tool and look at it**:
```
node scripts/shoot.mjs "http://127.0.0.1:5199/harness/effects.html?effects=chrome&logos=bulldog,monogram,crest&size=512" .shots/chrome.png --ready --full
node scripts/shoot.mjs "http://127.0.0.1:5199/harness/garments.html?garments=hoodie&effect=halftone" .shots/hoodie.png --ready --full
node scripts/shoot.mjs "http://127.0.0.1:5199/#studio" .shots/studio-m.png --mobile --full
```
Put shots under `mascot-lab/.shots/<your-area>/` (git-ignored). Iterate until it
looks professionally designed. Report honestly what still looks weak.

## Rules for parallel work

- Only edit files you own (named in your task). Read anything.
- Never run `vite build` into `dist/` while others work (use the dev server).
- Don't commit; the orchestrator commits between phases.
- No `Math.random()` in effects/garments; no network calls; no new deps.
