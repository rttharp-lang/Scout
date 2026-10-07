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
      worker/             effect Web Worker pool (pool.js) + the worker (effectWorker.js)
      sanitizeSvg.js      SVG allowlist sanitizer (uploads, orders, owner inbox)
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
      orderService.js     submit adapters (artifact db → endpoint → local), owner inbox
      orderSheet.js       order summary: text, CSV roster, HTML order sheet
      team.js             team name with the contact-school fallback (labels, files, refs)
    ui/
      components/         shared UI primitives (import from components/index.js; the
                          bare-hash router lives in components/router.js)  (updated)
      pages/              Landing, Studio, Collection, Order, Review, Done; step.css (shared
                          step-page title block), saveNotice.js (download result copy)
      landing/ studio/ collection/ order/   each page's own modules
    assets/samples/       sample logos (+ index.js); bulldog-on-white.jpg is a
                          background-removal test fixture, NOT in SAMPLE_LOGOS  (updated)
  harness/ui.html/.js     component gallery (?theme=light|dark&team=…&open=…)  (updated)
  scripts/gen-samples.mjs regenerates the sample SVGs + JPG fixture  (updated)
```

`src/assets/samples/index.js` (updated): `SAMPLE_LOGOS = [{ id, name, blurb, url, team: { school, mascot }, palette }]`
(ids `bulldog`, `crest`, `monogram`, in that order), `DEFAULT_SAMPLE` (= bulldog),
`getSample(id) → sample | null`. `url` is a Vite asset URL (a `data:` URL in the
single-file Artifact build). The SVG viewBoxes are tight squares, not 0 0 1000 1000.

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
  category: "print",           // "print" | "street" | "metal" | "retro" | "digital" | "optics" | "material" | "texture"
  blurb: "Comic-era dot screen in your team ink.",   // ≤ 60 chars, plain English
  method: "Screen print",      // how it would be produced on apparel:
                               // "Screen print" | "Sublimation" | "Embroidery" |
                               // "Chenille patch" | "Heat transfer" | "Puff print"
  stage: "paper",              // gallery card backdrop: "paper" | "dark" | "mid" | "team"
  params: [ /* ParamSpec[] — 3 to 7 controls, the ones a coach would actually touch */ ],
  presets: [ { name: "Comic", params: { /* partial */ } } ],  // 2–6 named looks, first = default look
  render(src, p, ctx) { /* … */ return canvas; },              // may return a Promise<canvas>
  mainThread: false,           // (updated) optional: true = never render in the worker
};
```
(updated) `render` normally runs in a Web Worker on `OffscreenCanvas` (see render.js):
no `document`, `Image` or DOM — make canvases with core.js `createCanvas` and read
pixels with `ctx2d`. An effect that genuinely needs the DOM sets `mainThread: true`.
Every effect module is bundled into the worker eagerly, so a module that throws at
import time disables the pool for everyone (renders still work, on the main thread).

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

(updated) Validation is structural only (id = filename, render(), name, ParamSpec
shapes, unique keys); unknown category → "print", unknown stage → "paper", no presets →
one preset named after the effect. Extra exports: `validateEffect(effect, id) → error|null`,
`availableEffectIds()` (every effect FILE present, loaded or not), and
`lintEffect(effect) → string[]` — advisory contract checks (name ≤16, blurb ≤60,
method from the list, 3–7 params, 2–4 presets, preset keys exist, color defaults are
roles, id in EFFECT_ORDER). The contact sheet prints them as `[lint] <id>: …`
console warnings and in red under the row header — fix them before you call an effect done.
`EFFECT_ORDER` today (23 looks): original, graffiti, chrome, halftone, neon, screenprint,
holographic, stencil, thermal, chenille, risograph, glitch, varsity, woodcut, sticker,
pixel, embroidery, melt, speed, puff, ascii, scribble, emboss.

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
As implemented (updated):
- (updated) **Where renders run**: a pool of min(2, cores − 1) Web Workers
  (`engine/worker/pool.js`) when Worker + OffscreenCanvas exist; each worker gets a logo's
  square source once per `logoKey|size` and returns an ImageBitmap that becomes an ordinary
  canvas. Main thread instead when the pool is unavailable, `?workers=0`, the effect sets
  `mainThread: true`, or a worker job fails (crash/timeout/throw → retried on the main
  thread; an effect that throws only in the worker stays on the main thread for the
  session). Same pixels either way. `window.__mascotRender` shows stats and toggles the pool.
- `createRenderQueue({ concurrency }?)` runs up to one job per worker (1 without workers);
  `cancel()` also aborts running jobs whose render hasn't reached a worker yet.
- Result canvases are **cached and shared** (pixel-budgeted LRU, ≈40 M px) — treat them as read-only; never
  draw into a canvas returned by `renderEffect` (copy it first). Sources are cached per
  `logoKey|size` (LRU 16), so always pass a `logoKey` that changes when the logo
  pixels change — use the `key` returned by `useLogoCanvas()`, NOT `state.logo.key`
  (they differ while a new logo decodes; see App state).
- `createRenderQueue()` also exposes `size` (pending count). `cancel(pred)` rejects the
  matching pending jobs with an Error whose `name === "AbortError"` — catch and ignore it.
- Extra exports: `resolveColor(roleOrHex, palette) → "#RRGGBB" | null`,
  `getSource(logoCanvas, size, logoKey)` (cached `makeSource`), `clearRenderCaches()`.

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

As implemented (updated):
- `hexToRgb`, `hslToRgb`, `rgbToHsl` return arrays that also carry named props
  (`const [r, g, b] = hexToRgb(h)` and `hexToRgb(h).r` both work). `rgbToHsl` → h in
  degrees 0–360, s/l in 0–1. `lighten/darken/saturate(hex, amt)` add/subtract HSL
  lightness/saturation (0–1, Sass style).
- `blurMask(mask, w, h, r)` and `blurCanvas(canvas, r)`: `r` is the gaussian standard
  deviation in px (like CSS `blur(r)`).
- `traceContours` returns canvas coordinates with pixel centres at +0.5 (filling the
  paths lines up with the image). `clipToMask(canvas, mask)` accepts a canvas or a
  Float32Array mask. `compose` also takes `w, h`.
- Extra exports: `clamp, lerp, smoothstep, getPixels, canvasFromImageData,
  resizeCanvas(c, w, h), normalizeHex, hslToHex, contrastRatio, SRGB_TO_LINEAR,
  insideDistance/outsideDistance(mask, w, h, threshold)` (one side, half the cost),
  `signedDistance(mask, w, h, threshold)` (px, negative inside), `supportsCanvasFilter,
  simplifyPolyline, contoursToPath(contours, scale, dx, dy) → Path2D, gradientLUT(stops),
  nearestColorIndex, maskBounds(mask, w, h, threshold) → { x0, y0, x1, y1, empty },
  sampleBilinear(map, w, h, x, y)`.

### image.js

```js
export async function loadImageFromFile(file: File): Promise<HTMLCanvasElement>   // png/jpg/webp/gif/svg; SVG rasterized at 2048 long side
export async function loadImageFromUrl(url): Promise<HTMLCanvasElement>
   // (updated) data:image/svg+xml URLs are decoded in JS (no fetch — Artifact CSP safe)
export function hasTransparency(canvas): boolean
export function removeBackground(canvas, tolerance = 28, { holes = "auto" } = {}): { canvas, removed: boolean }   (updated)
   // flood-fill from the border through pixels close to the dominant border color,
   // feathered edge; removed=false if the border isn't a near-uniform color.
   // Enclosed regions (eyes, teeth) survive; holes: "auto" clears exact-background
   // counters only for single-ink marks | "keep" | "clear".
export function trimTransparent(canvas, alphaThreshold = 8): HTMLCanvasElement
export async function prepareLogo(input: File | string | HTMLCanvasElement,
                                  { removeBg = "auto", tolerance = 28, maxSide = 1600 } = {})
   : Promise<{ canvas, bgRemoved: boolean, hadAlpha: boolean, width, height }>
export function makeSource(logoCanvas, size): HTMLCanvasElement   // square S×S, logo in central SAFE box
export function extractPalette(canvas, k = 6, { maxSamples = 20000 } = {}): Array<{ hex, weight }>   (updated)
export function suggestPalette(canvas): palette   // primary = most prominent saturated color, etc.
   // (updated) accent is white when the logo has ≥6% near-white and a dark primary.
   // Picks by AREA: the sample monogram comes out gold-primary, so prefer a sample's
   // own `palette` for samples and let the coach confirm/swap roles for uploads.
export function canvasToDataURL(canvas, maxSide = 1024): string
// extra exports (updated): SAFE (0.72), rasterizeSvgText(svgText, longSide = 2048)
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
Optional extensions renderMockup understands (updated; all additive, see the header of
`renderMockup.js` and `garments/jersey.js`, the copyable reference garment):
- `part.over: true` — painted AFTER graphics + lettering (jock tag, drawcords, labels).
- `part.texture: false` — no fabric texture on this part (woven labels, tapes).
- `part.rule: "evenodd"` — fill rule for a part with holes.
- `overlay.follow: "M…"` (rib: wales perpendicular to this centre line, for curved
  bindings), `overlay.angle` (rib direction, default 90), `overlay.gap` (stitch: twin-needle
  spacing, default 4), `overlay.width` = line width for seam/stitch but **blur radius** for
  shadow/highlight/edge.
- Parts are clipped to the silhouette (bands may overshoot it); `printArea` is clipped
  with the even-odd rule, so an inner subpath cuts a hole.
- **`chest-left` is the wearer's left chest = the viewer's RIGHT on a front flat.**
  Same convention for `leg-left`, `thigh-left`, `leg-left-long`.

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
(updated) Validation: id = filename, name, front+back views with silhouette path data and
≥1 valid zone are required (else skipped with a warning). Bad parts/overlays/zones are
dropped with a warning; a missing printArea falls back to the silhouette; **missing
required zones only warn** (the garment still loads — placements on a missing zone fall
back, see renderMockup). Unknown fabric → "knit", unknown category → "warmup", defaults
filled for styleCode/spec/defaultColors. Extra exports: `REQUIRED_ZONES`,
`availableGarmentIds()`.

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

As implemented (updated):
- Extra option `timings: {}` → filled with per-phase ms. Throws only when the garment/view
  is missing; bad placements are skipped.
- `placement.tint` also accepts `"tonal"` (a shade off `colors.base`) or `"base" | "trim" |
  "accent"`. A tint is a **one-color screen separation** (ink density follows the
  graphic's luminance, so linework survives), not a flat silhouette; `knockout: false`
  forces the flat silhouette. Extra Placement keys (e.g. `source`) are ignored.
- Unknown `zone` → `center` → `back-center` → the view's first zone.
- `text`: draws only the boxes the view defines (the jersey FRONT has only `number`, the
  BACK has `name` + `number`); a null/empty `name`/`number` is skipped. `fill`/`outline`
  are hex; the convention (harness + recipes) is `fill: colors.accent, outline: colors.trim`.
  Call `await fontsReady()` once before the first render, or the first lettering uses a
  fallback serif.
- Caches key on **canvas identity** (tinted/scaled graphics) — never redraw into a canvas
  you already passed; pass a new canvas when the content changes (renderEffect does).
- Timing reality: warm re-renders (new colors/graphics) ≈ 1.5 ms @600, 6.5 ms @1600; the
  FIRST render of each garment view at a new size is ≈ 55–100 ms @600 (one-time shading
  + texture layers), ≈ 110–180 ms @1600.
- Extra exports: `tonalOf(baseHex)`, `viewBounds(garment, viewId)`, `ARTBOARD` (1000),
  `SAFE` (0.72), `LETTERING_FONT`. textures.js: `FABRICS`, `getFabricTile`, `fabricPattern`.

### collection.js

```js
export const DROP_STYLES = [   // ids fixed; copy may be improved
  { id: "statement", name: "Statement", blurb: "Oversized hits that crop off the edge. The warm-up look." },
  { id: "classic",   name: "Classic",   blurb: "Chest crests, numbers, clean back hits." },
  { id: "allover",   name: "All-over",  blurb: "Your graphic as a repeat print, edge to edge." },
  { id: "tonal",     name: "Tonal",     blurb: "Graphic printed a shade off the base. Understated." },
];
export function buildCollection(dropStyleId, palette, { effectStage } = {}): Collection   // (updated)
Collection = {
  dropStyle,
  effectStage: "dark" | null,                               // (updated) recorded for rebuilds
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
As implemented (updated): DROP_STYLES entries also carry `note` (a longer sentence).
Placement specs are fully expanded (`source, zone, scale, dx, dy, rotate, mode, tile,
opacity, tint, blend`). Tonal/all-over tints are **resolved hexes computed from the
palette**, so the collection must be rebuilt when the palette changes (the store does
this). Items the coach edits via `updateItem` carry `custom: true` and survive palette
changes and reloads; non-custom items are rebuilt from the current recipes on load.
Recipes exist for all six garments; the UI must skip garments the registry did not load.
Extra exports: `resolveColor(roleOrHex, palette)`, `tonalTint(baseHex)`, `getDropStyle(id)`.
(updated) **Effect-aware colorways**: `effectStage: "dark"` (the chosen effect's `stage`)
moves every piece that prints the full-color effect on a light base onto a dark base
(trim/lettering re-picked); other stages change nothing. The store keeps
`collection.effectStage` in sync with the chosen effect, so **any code that rebuilds a
recipe outside the store (style thumbnails, "reset this piece") must pass
`{ effectStage: state.collection.effectStage }`**, or it shows light pieces the real
collection no longer uses.
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

As implemented (updated):
- `buildOrder(state, ctx) → body` (schema `mascot-lab/order@1`, fields in README "How
  orders flow"); `submitOrder(body, { logoFile? })` also returns `stored`,
  `fallbackReason`, `attempts`, `logoStored`. Refs: `makeRef(team)` = `teamInitials` +
  5 Crockford chars (`NB-4F7K2`); `likelyChannel()` labels the send button up front.
- **Team name fallback** (`order/team.js`): `teamFields(team, contact)` /
  `teamLabel(team, contact, empty)` — an upload clears the sample team name, and until the
  coach types one the contact form's school stands in. `buildOrder`'s `team`, refs,
  file names (`fileBase`, line sheet, garment and Studio PNGs) and the owner inbox use it.
- **Private order inbox** (Artifact `db`, rules in README): each coach writes only
  `orders/<viewer id>` = `{ orders: [compact bodies, newest first, ≤ 10, < 240 KiB],
  updatedAt, app }`; an uploaded logo goes to `orders/<viewer id>/logos/logo-<hash>`
  (data URL ≤ 200 KB, sanitized if SVG); order statuses live in the owner-only
  `orders/_status` = `{ statuses: { [ref]: { status, at } } }` (`ORDER_STATUSES`), so the
  owner never rewrites a coach's document. Owner side: `ownerInboxAccess()`,
  `watchOrders(db, onOrders, onError)` (one collection subscription, flattened),
  `setOrderStatus`, `fetchOrderLogo` (re-sanitizes). Local copies: `localOrders()`,
  `findLocalOrder(ref)`; revisions: `rememberRevision` / `pendingRevision` / `clearRevision`.
- **Design pack** (`ui/order/exports.js` `makeDesignPack`, `<team>-<ref>-design-pack.zip`):
  `artwork/<effect>-2048.png` (transparent print art), `garments/<id>-front|back.jpg`
  (1200 px), `order-sheet.html`, `roster.csv`, `order.json`, `README.txt` (+ the order
  text). The uploaded logo file itself travels with a db/endpoint order, not in the pack.
- `engine/sanitizeSvg.js`: `sanitizeSvg(text) → string | null` (allowlisted SVG drawing
  elements; no script/foreignObject/on*/external refs/@import), `svgDataUrl(text)`,
  `dataUrlText(url)`, `cleanCss(text)`. Used by `rasterizeSvgText` (uploads), before an
  order is sent, and again in the owner inbox before a logo is saved.

## Platform (claude.ai Artifact runtime) — `src/platform/claude.js`

When published as an Artifact the page runs in a sandboxed frame: `<a download>`
and `window.print()` do nothing, forms can't post anywhere, `alert/confirm/prompt`
are no-ops, only bare `#token` hashes survive. So:
- `getCapability(name)` → `window.claude?.use?.(name) ?? null` (await; null when absent; never throws).
  (updated) Memoized per name, gives up after 12 s. Also `inArtifactRuntime()`,
  `prefetchCapabilities(names)` (main.jsx prefetches "downloads"), `resetCapabilities()`.
- `saveFile(filename, blobOrString)` (in `platform/files.js`): tries the `downloads`
  capability (`(await claude.use("downloads")).save({ filename, data })`), and falls
  back to an `<a download>` click outside the Artifact frame. Returns
  `{ ok, how: "downloads" | "anchor", error?, code? }` (updated). Allowed extensions there:
  png, jpg, svg, zip, csv, json, html, txt, pdf. (updated) When the capability exists
  but answers `declined | rate_limited | rejected_extension | bad_request`, it returns
  `{ ok: false, how: "downloads", error, code }` WITHOUT trying the anchor (show `error`
  in the UI); only "can't save here" codes fall back to the anchor. Also `mimeFor(filename)`.
  (updated) Inside the Artifact frame WITHOUT the capability it returns
  `{ ok: false, how: "anchor-inert", code: "downloads_unavailable" }` (the anchor would do
  nothing). Every download button words its result through `ui/pages/saveNotice.js`
  (`saveToast`, `saveError`, `cantSaveHere`): "Downloads aren't available in this view.
  Open the site in a browser to save files."; #done also checks the capability up front.
- (updated) `platform/storage.js`: `load(key, fallback = null)`, `save(key, value) →
  { ok: true, bytes } | { ok: false, reason: "unavailable" | "quota" | "error" }`,
  `remove(key)`, `available()`. Never throw.
- Never use `alert/confirm/prompt/window.print`; build confirmations into the UI.
- Routing uses bare hash tokens only: `#home`, `#studio`, `#collection`, `#order`, `#review`, `#done`.
- `localStorage` access always in try/catch (`platform/storage.js`); the app must
  work when it throws or comes back empty.

## App state (`src/state/store.jsx`)

```js
{
  version:   1,                                                          // (updated)
  team:      { school: "Northgate", mascot: "Bulldogs", isSample: true },
  logo:      { src, name, bgRemoved, tolerance, key, sampleId? },        // (updated)
             //  src: URL or data URL (NOT `dataUrl`); bgRemoved is the SETTING
             //  "auto" | true | false (default "auto"); key = hash(src)+bg+tolerance,
             //  recomputed by the reducer; sampleId set for SAMPLE_LOGOS (stored by id)
  palette:   { primary, secondary, accent, dark, light },
  effect:    { id: "graffiti", params: {}, seed: 7 },        // params: overrides only
             //  (updated) if the id's file doesn't exist/load, the store switches to the
             //  first loaded non-"original" effect (halftone today) and persists that
  favorites: [effectId],
  collection: Collection,                                   // from buildCollection()
             //  (updated) edited items carry custom: true; effectStage follows the effect
  roster:    [RosterRow], extras: {…},                      // (updated) 12 example rows, example: true
  contact:   { coach, email, phone, school, address, needBy, notes, rightsConfirmed? },
  order:     { status: "draft" | "submitted", ref, channel, submittedAt } ,
  flags:     { logoNotSaved },   // (updated) uploaded logo was too big to persist → sample shown
}
```
Exposed via `useStore() → { state, dispatch, actions }` with named action helpers
(updated, complete list): `setLogo`, `loadSample`, `setTeam`, `setPalette`, `setEffect`,
`setEffectParams`, `setEffectSeed`, `toggleFavorite`, `setDropStyle`, `updateItem`,
`setCollection`, `setRoster`, `setExtras`, `setContact`, `markSubmitted`, `reopenOrder`,
`dismissFlag`, `reset`. The provider also dispatches `setEffectStage` itself whenever the
chosen effect changes (keeps `collection.effectStage` in sync; not an action helper).
Persisted to localStorage (debounced, try/catch) under `mascot-lab:v1`.
`useLogoCanvas()` returns the decoded logo canvas (memoized by `logo.key`).

Action signatures as implemented (updated):
- `setLogo({ src?, name?, bgRemoved?, tolerance?, sampleId? })` — merges; key recomputed;
  a new src without sampleId sets `team.isSample = false`. (It does NOT change the
  palette or team name — the upload flow should call `suggestPalette` + `setPalette`/`setTeam`.)
- `loadSample(id)` — sample logo + its team + palette (rebuilds the collection).
- `setTeam({ school?, mascot? })`, `setPalette(partial)` (rebuilds non-custom collection items).
- `setEffect(id, { params?, seed? } = {})` — a new id resets params to {} unless given.
  Apply a preset with `setEffect(id, { params: preset.params })` or `setEffectParams(null)`
  then `setEffectParams(preset.params)`.
- `setEffectParams(patch | null)` — merges overrides; `null`/no arg clears; `undefined`
  values delete a key. `setEffectSeed(n)`.
- `toggleFavorite(id)`, `setDropStyle(id)` (keeps only per-item `enabled`).
- `updateItem(garmentId, patch | (item) => patch)` — `colors` merge; any key other than
  `enabled` marks the item `custom`. `setCollection(collection)`.
- `setRoster(rows | fn)`, `setExtras(obj | fn)`, `setContact(partial)`.
- `markSubmitted({ ref, channel, submittedAt? })`, `reopenOrder()`, `dismissFlag(name)`,
  `reset()` (also clears storage).
- Also exported from store.jsx: `STORAGE_KEY`, `DEFAULT_EFFECT_ID`, `DEFAULT_TOLERANCE`,
  `createInitialState()`, `teamCssVars(palette)`, `logoKey(logo)`, `hashString`, `normHex`,
  `EMPTY_CONTACT`, `rosterHasExamples(roster)`.
- Test handle: `window.__mascotLab = { getState, actions, storageKey }` (always present).

`useLogoCanvas()` (in `state/useLogoCanvas.js`) (updated) → `{ canvas, key, status:
"idle" | "loading" | "ready" | "error", error, info: { bgRemoved, hadAlpha, width, height } }`.
While a new logo decodes it keeps returning the PREVIOUS canvas with that canvas's own
`key` — **feed render caches (`renderEffect`'s `logoKey`) the returned `key`, never
`state.logo.key`**, or the new key gets cached against the old pixels. Outside React:
`getLogoCanvas(logo) → Promise<{ canvas, info }>` (same memo).

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

(updated) Fonts are imported once in `main.jsx` as `"@fontsource/<family>/<weight>"`
(no `.css` suffix — some packages' export maps reject it); pages don't import fonts.
CSS vars the store writes on `<html>`: `--team-1/2/3` (primary/secondary/accent),
`--team-dark`, `--team-light`, `--team-{1,2,3}-ink` (readable ink on each),
`--team-on-light(-ink)`, `--team-on-dark(-ink)` (the team color that reads on each
theme's background) and (updated) `--team-flash-on-light` / `--team-flash-on-dark`
(`teamCssVars` writes both; tokens.css points `--team-flash` at the current theme's).
Components use `--accent` / `--accent-ink`,
which tokens.css points at the readable team color per theme — prefer those in pages.
Shared components (import from `ui/components/index.js`): Button (variants incl. `team`),
Spinner, IconButton, Field/Input/Textarea, Slider, Select, Toggle, Segmented, Chip/ChipRow,
ColorField, NumberStepper, Modal/Sheet, CopyText/copyToClipboard (updated: moved here from
ui/order, which re-exports it), ConfirmProvider/useConfirm (awaitable confirm —
use instead of `confirm()`), ToastProvider/useToast, SpecLabel, Swatch/inkFor, Skeleton,
CanvasImage, Tabs/TabPanel, Notice, Wordmark/RegMark, StepNav, TeamChip, ThemeSwitch,
and router helpers `useRoute`, `navigate(route)`, `currentRoute`, `href(route)`.
See harness/ui.html for every state. Page copy/titles live in `src/brand.js`.
(updated) Color chips outside `Swatch` (Studio role chips, Collection look-panel pickers)
use the same two edges as `Swatch`: an inner line in the chip's own ink + an outer
hairline in the theme ink, so `#111111` reads on the dark theme.
(updated) **Step pages** (Studio, Collection, Order, Review, Done) share one title block
(`ui/pages/step.css`): `.pg-head` (step label → h1, 12 px), `.pg-title` (`--pg-title` =
`--step-4`, 60 px at 1440 / 35 px at 390) and `--pg-top` (32 px, 24 px ≤ 720) above it;
every step page sits in `.container` (`--page-max` + `--gutter`), aligned with the header.
Landing keeps its own editorial hero. Forward actions use `Button variant="team"`.
US English throughout (color, canceled).

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

## Integration notes — foundation phase (updated)

Verified together on the dev server (real modules, no fallbacks): effects harness
(Clean + Halftone × bulldog/monogram/crest/bulldog-on-white, 33/33 engine checks),
garments harness (jersey × 4 drop styles × front/back with the real halftone render of
the bulldog), and the app (#home … #done at 1400 px and 390 px: 0 console errors, no
horizontal scroll, reload keeps palette/favorites/contact/drop style/uploaded logo).
The JPG fixture's background removal is clean: 0.03% light pixels on the cut edge,
no holes in eyes/teeth, alpha within 0.05% of the SVG's.

**The pipeline a page uses** (this is exactly what was tested):
```js
const { state } = useStore();
const logo = useLogoCanvas();                       // { canvas, key, status, info }
const effect = await getEffect(state.effect.id);
const art = await renderEffect(effect, logo.canvas, state.effect.params, state.palette,
  { size, seed: state.effect.seed, quality, logoKey: logo.key });   // returned key!
const clean = await renderEffect(await getEffect("original"), logo.canvas, {}, state.palette,
  { size, logoKey: logo.key });                     // the "logo" placement source
await fontsReady();
for (const g of await loadGarments()) {             // skip garments that didn't load
  const item = state.collection.items[g.id];
  if (!item?.enabled) continue;
  const colors = resolveColors(item.colors, state.palette);
  for (const view of ["front", "back"]) {
    const graphics = item[view].map((p) => ({ ...p, canvas: p.source === "logo" ? clean : art }));
    const text = item.text && { name: item.text.name ? "CARTER" : null,
      number: item.text.number ? "23" : null, fill: colors.accent, outline: colors.trim };
    renderMockup(g, view, { size: 600, colors, graphics, text });
  }
}
```
- Effect render size for mockups: oversized placements draw the 72% SAFE box at up to
  ~1.1× the zone, so the effect canvas is upscaled — render effects at **1024 for
  mockups ≤ 800 px and 2048 for 1600 px exports** (gallery thumbnails: 384, `quality: "preview"`).
- Gallery card backdrops (`effect.stage`), as the contact sheet paints them: paper
  `#ECEBE6`, dark `#101216`, mid `#7D838C` (heather; Halftone uses it so white ink reads),
  team = `darken(palette.primary, 0.06)`. Results are transparent — the stage is the card.
- Feed gallery renders through one `createRenderQueue()` (visible cards at higher
  priority, `cancel()` on logo/palette change); budget reality: Halftone's FIRST render
  at 384 is ≈150–185 ms cold (over the 150 ms budget), 55–95 ms warm.
- Garment first renders are the slow part (≈55–100 ms @600 each, one-time per view and
  size); render the visible garment first and stagger the rest (e.g. through the queue).
- Uploads: store the file as a data URL in `logo.src` (`setLogo({ src, name })`) and let
  `useLogoCanvas` decode it (SVG stays SVG text). A data URL over the localStorage quota
  is dropped on save and `flags.logoNotSaved` warns on the next visit, so re-encode big
  rasters before storing: `prepareLogo` caps the long side at 1600 anyway, so a 1600 px
  re-encode (PNG if it has transparency, else JPEG ≈0.92) loses nothing visible. Then
  propose colors with `suggestPalette(canvas)` and let the coach confirm/swap roles.
- (then) Only `original` + `halftone` and the `jersey` existed after the foundation phase;
  (now) all 23 effects and 6 garments ship. Pages still handle "not loaded yet" (the
  registries skip modules that fail).
- (resolved) Sample SVGs decode in the Artifact frame (`data:` URLs, decoded in JS); the
  effect worker is inlined as a `blob:` worker in the single-file build, and the
  main-thread fallback covers a CSP that refuses it (`node scripts/e2e.mjs --artifact
  --worker-src="'none'"` exercises the fallback).
- `state.effect.id` defaults to "graffiti"; until graffiti.js loads, the store falls
  back to halftone and persists it (a dev browser keeps halftone until reset —
  `window.__mascotLab.actions.reset()`).
