# Mascot Lab design rules ("Studio")

Mascot Lab should look like a premium sport product site (Nike.com product pages, Apple product pages, Kith, Arc'teryx) that is also a precise creative tool (Linear, Framer). The artwork and the garments carry the page. The UI around them is quiet, monochrome and exact.

This file is for whoever restyles a page. Read it before you touch page CSS. It covers the tokens, the type roles, the layout patterns (with CSS you can copy), how to show artwork and garments, and what to remove from the old "spec sheet" look.

**See it working:**

- `/harness/design.html` is the showcase. It has a landing hero with a real effect render, a looks rail, a 3-up lookbook, the studio inspector, the order form, roster and summary, and the loading, empty and error states. Use `?theme=dark`, `?team=ember|forest|lemon` and `?hero=<effectId>&look=<effectId>`.
- `/harness/ui.html` shows every shared component in every state.

**Where things live:**

| What | Where |
| --- | --- |
| Tokens (light and dark) | `src/styles/tokens.css` |
| Font faces | `src/styles/fonts.css` |
| Reset, type roles, form controls, layout pattern classes | `src/styles/global.css` |
| Components | `src/ui/components/*` and `components.css` |
| Header, footer and page outlet | `src/App.jsx` and `src/ui/components/shell.css` |
| Step page title block | `src/ui/pages/step.css` |

---

## 1. Principles

1. **Image first.** Artwork and garments are the largest things on every page, and each one sits on a soft studio tile. Chrome (navigation, controls, labels) is small, monochrome and set back.
2. **Use the team color only as an accent.** It marks selection, progress, the one forward CTA, slider fills and toggles. Never use it for decoration: no team-colored stripes, panels, headings or backgrounds.
3. **Separate with space and tone, not lines.** Use generous whitespace on a strict 4/8 rhythm and soft neutral tiles. Use a hairline (`--line`, about 8% ink) only where space alone can't do the job: table rows, panel groups, the header once it is scrolled.
4. **Make the hierarchy obvious.** A page has one title, one primary action, and section titles in sentence case. Use the wide uppercase display face for a few big statements only.
5. **Precise, not busy.** No crop marks, registration marks, court drawings, offset shadows, boxed sections or mono labels on everything. When in doubt, remove it.
6. **Calm motion.** Use 180–320 ms with ease-out (`cubic-bezier(.2,.8,.2,1)`). Pages fade in and rise 8 px. Image tiles scale 1.03 on hover. Respect `prefers-reduced-motion`; global.css already does.

---

## 2. Tokens

Use tokens only, never raw hex, in page CSS. The old token names still work, but they now point at the new values (see §10). New code uses the new names.

### Surfaces and ink

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--page` | `#FFFFFF` | `#0A0A0C` | Page background. Also the fill for things on a tile. |
| `--tile` | `#F4F5F7` | `#151619` | Studio grey: image tiles, grouped content, secondary buttons, chips |
| `--tile-hover` / `--tile-strong` | `#ECEEF1` / `#E3E5E9` | `#1C1D21` / `#24262B` | Hover, pressed, slider tracks |
| `--raised` | `#FFFFFF` | `#18191D` | Floating layers: dialogs, sheets, popovers |
| `--field` / `--field-hover` | tile | `#17181B` | Input fill. Inside a tile, add `.ml-on-tile`, which switches the fill to `--page`. |
| `--fill` / `--fill-strong` | ink 5% / 9% | white 6% / 10% | Translucent hover fills that work on any surface |
| `--glass` | white 78% | page 72% | Sticky header and bars (use with a backdrop blur) |
| `--ink` | `#0B0C0F` | `#F4F5F7` | Text |
| `--ink-2` | `#5F636B` (6.0:1) | `#A3A6AE` (8.1:1) | Secondary text. It still reads at 4.5:1 or better on `--tile`. |
| `--ink-3` | `#8C9099` | `#6E727B` | Placeholders and disabled glyphs only. It is decorative and fails AA for body text. |
| `--ink-fill` / `--ink-inverse` | black / white | white / black | Primary buttons, selected chips, toasts |
| `--line` | ink 8% | white 9% | The hairline |
| `--line-strong` | ink 16% | white 17% | A divider that has to read on a tile |
| `--focus` | `#0B66FF` | `#5B9BFF` | Focus ring. Never use a team color for focus. |
| `--accent` / `--accent-ink` | readable team color | readable team color | Selection, progress, the team CTA. The store picks a team color with at least 3:1 contrast on each theme's page. |
| `--accent-soft` | accent 10% | accent 10% | A rare tint behind a selected row |
| `--success` / `--warning` / `--danger` (`-soft`) | | | Signals only |

### Stages: the backdrops behind artwork

Effect renders are transparent. The stage is the tile the render sits on.

| Token | Light | Dark | For |
| --- | --- | --- | --- |
| `--stage-paper` | `#F1F1EE` | `#E9E9E6` | Effects with `stage: "paper"` (light-ground prints) |
| `--stage-mid` | `#8A8F98` | `#5F646D` | `stage: "mid"`: heather grey, where white ink reads |
| `--stage-dark` | `#121316` | `#0E0F12` | `stage: "dark"`: chrome, neon, glow |
| `--team-1` | | | `stage: "team"` |
| `--stage-product` | `#F4F5F7` | `#2A2C31` | **Garments.** In dark it is lifted so a black hoodie keeps its silhouette. |

### Spacing, layout, shape, elevation, motion, layers

- **Space:** `--space-0…10` are 2, 4, 8, 12, 16, 24, 32, 48, 64, 96 and 128 px.
  - Between page sections, use `--section-y` (64 → 128 px).
  - Page side padding is `--gutter`: 16 px at 390 px wide, 48 px at 1200 px and up.
  - The page is at most `--page-max` (1440 px) wide.
  - Text runs at most `--measure` (62ch).
  - Gaps in image tile grids use `--grid-gap` (8 → 16 px).
- **Radius:** `--radius-xs` 4, `-sm` 8 (thumbs), `-md` 12 (inputs, menus), `-lg` 16 (tiles, cards), `-xl` 20 (hero tiles, dialogs, sheets), `-2xl` 28, `-pill` 999 (buttons, chips, segmented controls, team pill).
- **Elevation (floating layers only):**
  - `--shadow-hover` for a tile on hover.
  - `--shadow-raised` for a small popover.
  - `--shadow-overlay` for toasts and menus.
  - `--shadow-modal` for dialogs and sheets.
  - `--shadow-sticky` for bottom bars.
  - `--shadow-header` for the header's scrolled hairline.
  - `--shadow-card` is not a shadow. It is the hairline ring for a white card on white; use it sparingly.
- **Motion:** `--dur-1` 120 ms (press), `-2` 180 ms (hover), `-3` 260 ms (panels, indicators), `-4` 320 ms (page enter, image reveal). Easing is `--ease-out`. `--ease-snap` is only for toggle knobs.
- **Layers:** `--z-sticky` 100, `--z-header` 200, `--z-dropdown` 300, `--z-overlay` 400, `--z-modal` 500, `--z-toast` 600.

---

## 3. Type

There are three faces, each with one job:

| Face | Token | Job |
| --- | --- | --- |
| **Geist** | `--font-sans` | All UI and body text. Headings are sentence case, semibold, tight. |
| **Archivo Wide** (Archivo variable, width pinned at 125%) | `--font-wide` | Big uppercase statements: a hero line, a section opener, a big number. Use one or two per page at most. |
| **Geist Mono** | `--font-mono` | Tiny metadata only: hex codes, style codes, sizes. |

Graduate stays for jersey lettering, inside the mockup renderer.

### Type roles

Use these classes. Don't hand-roll sizes.

| Class (or element) | Face / weight | Size, 390 → 1440 | Leading / tracking | Use |
| --- | --- | --- | --- | --- |
| `.t-hero` | Wide 900, UPPERCASE | 40 → 116 (`--display-lg`) | 0.86 / −0.018em | Landing hero line. Size it so the longest line fits (see §4.2). |
| `.t-display` | Wide 900, UPPERCASE | 36 → 76 (`--display-md`) | 0.9 / −0.012em | One statement per page, at most |
| `.t-display-sm` | Wide 850 at wdth 115, UPPERCASE | 28 → 48 (`--display-sm`) | 0.94 | Big facts or numbers ("12 PCS", "2 DAYS") |
| `h1`, `.t-title-1`, `.pg-title` | Geist 600 | 32 → 52 (`--text-4xl`) | 1.06 / −0.035em | Page title |
| `h2`, `.t-title-2`, `.ml-section-head__title` | Geist 600 | 26 → 38 (`--text-3xl`) | 1.1 / −0.022em | Section title |
| `.t-title-3` | Geist 600 | 22 → 28 (`--text-2xl`) | 1.18 | Inspector title, dialog title |
| `h3`, `.t-headline` | Geist 600 | 20 | 1.25 | Group or card heading ("Summary", "Roster") |
| `.t-subhead` | Geist 600 | 16 | 1.35 | Row titles, totals labels |
| `.t-lead` | Geist 400, `--ink-2` | 17 → 20 | 1.5 | The sentence under a title (62ch max) |
| body, `.t-body` | Geist 400 | 16 | 1.55 | Running text |
| `.t-body-sm` | Geist 400 | 14 | 1.5 | Dense text in panels |
| `.t-caption` (add `.muted`) | Geist 400 | 14 | 1.45 | Hints, fine print |
| `.t-eyebrow` | Geist 500, `--ink-2`, sentence case | 14 | — | The small line above a title ("Step 2 of 3") |
| `.t-label` | Geist 500 | 14 | — | Control labels (Field and Slider use this) |
| `.t-meta` | Geist Mono 450, `--ink-2`, tabular | 12 | — | `#13294B`, `ML-J01`, `YS–3XL`. Nothing else. |
| `.t-price` | Geist 500, tabular | inherit | — | Prices |
| Product card title / meta / price | `.ml-card__title` 15/500, `__meta` 14 in `--ink-2`, `__price` 15/500 | | | Nike-style product caption |

**Numbers:** use `font-variant-numeric: tabular-nums` (the `.num` class) for anything that updates or lines up: prices, counts, quantities.

**Case:** sentence case everywhere ("Order the kit", "Put it on the kit"). Uppercase is only for `.t-hero`, `.t-display` and `.t-display-sm`.

**Copy:** write step labels as "Step 2 of 3", not "Step 02 / 03". Write numerals ("23 looks"), not words.

---

## 4. Layout patterns

The page shell is already done. `App.jsx` renders a sticky glass header (64 px, 56 px on phones), the page outlet `<div class="ml-page">` (fade plus an 8 px rise on every route change) and a quiet footer.

Every page sits in `.container`, which is `--page-max` wide with `--gutter` padding, the same box as the header. Don't add page-level borders or backgrounds.

### 4.1 Step page title block (Studio, Collection, Order, Review, Done)

```jsx
<div className="container" style={{ paddingTop: "var(--pg-top)" }}>   {/* 48 px, 32 px on phones */}
  <header className="pg-head">
    <SpecLabel size="lg">Step 2 of 3</SpecLabel>          {/* eyebrow: 14 px, ink-2 */}
    <h1 className="pg-title">The Bulldogs collection</h1>
    <p className="t-lead">Your look on every piece of the kit.</p>
  </header>
  …
</div>
```

The page's actions go right after the title block, or into a sticky bar on phones. No rule under the title: the next block's spacing (`--space-7`) does the separating.

### 4.2 Landing hero

Showcase: `.ds-hero`. The structure:

- A full-width row with the wide headline on the left and the supporting copy and CTAs on the right, aligned to the headline's last baseline.
- Under it, a 7 : 5 row of hero tiles: the artwork on its stage, and the product on `--stage-product`.

```css
.hero { padding-top: clamp(40px, 2rem + 3vw, 96px); }
.hero__top { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,400px); align-items: end; gap: var(--space-6) var(--space-7); margin-bottom: clamp(32px, 1rem + 3vw, 56px); }
.hero .t-hero { font-size: clamp(2.5rem, calc((100vw - 2 * var(--gutter) - 448px) / 8.8), 7.25rem); } /* the longest line fits beside the aside */
.hero__media { display: grid; grid-template-columns: minmax(0,7fr) minmax(0,5fr); gap: var(--grid-gap); }
.hero__art { --tile-ratio: 7 / 6; --tile-pad: 9%; }
.hero__product { --tile-ratio: auto; height: 100%; --tile-pad: 5%; }
@media (max-width: 1024px) { .hero__top { grid-template-columns: minmax(0,1fr); } .hero .t-hero { font-size: var(--display-lg); } }
@media (max-width: 720px) {
  .hero__media { grid-template-columns: minmax(0,1fr); }
  .hero__art { --tile-ratio: 1; --tile-pad: 8% 12% 22%; }     /* room at the bottom for the caption pill */
  .hero__product { --tile-ratio: 4 / 5; height: auto; --tile-pad: 4% 4% 18%; }
}
```

- **CTAs:** one `Button variant="team" size="lg"` and one `variant="ghost" size="lg"` with an arrow. On phones both go full width.
- **Captions on hero tiles:** use a glass pill in the bottom-left corner (name, plus a meta line), never over the artwork's center.

### 4.3 Section and section head

```jsx
<section className="container ml-section">
  <div className="ml-section-head">
    <div className="ml-section-head__text">
      <h2 className="ml-section-head__title">23 looks. One logo.</h2>
      <p className="ml-section-head__sub">Every tile is your mascot, rendered live in your team colors.</p>
    </div>
    <a className="ml-link" href="#studio">See all <ArrowRight /></a>   {/* or rail arrows, or a ghost button */}
  </div>
  …
</section>
```

`.ml-section` gives `--section-y` above and below. Two sections in a row share the gap.

Use one section head per section. Don't put a heading inside a box.

### 4.4 Image tiles and product cards

Every image sits on a `.ml-tile`. The tile is the backdrop; the render is transparent.

```jsx
<a className="ml-card" href="#collection">
  <div className="ml-tile ml-tile--portrait ml-tile--product ml-tile--interactive">
    <div className="ml-tile__media"><CanvasImage canvas={mockup} ratio={1} alt="Warm-up hoodie" /></div>
    <span className="ml-tile__badge"><SpecLabel variant="box">Most ordered</SpecLabel></span>
    <span className="ml-tile__action"><IconButton variant="glass" size="sm" label="Favorite" icon={<Heart />} /></span>
  </div>
  <div className="ml-card__body">
    <span className="ml-card__title">Warm-up Hoodie</span>
    <span className="ml-card__meta">Statement drop · Fleece</span>
    <span className="ml-card__price">$62</span>
  </div>
</a>
```

**Ratios:**

- Use `--square` (1:1, the default) for effects and logos.
- Use `--portrait` (4:5) for garments.
- `--landscape` (4:3) is rare.

**Stage classes:**

- `ml-tile--paper`, `--mid`, `--dark` and `--team` are for effects. Map them from `effect.stage`.
- `ml-tile--product` is for garments.
- With no stage class you get `--tile`.

**Padding (`--tile-pad`):**

- Effects: 10–12%.
- Garments: `6% 4%`. They are wide, so pad the sides less.
- Hero: 5–9%.

Mockups are square renders; draw them with `CanvasImage ratio={1}` inside `.ml-tile__media`.

**States:**

- **Hover** (`.ml-tile--interactive`): the image scales 1.03 and the tile gets `--shadow-hover`, over 320 ms. This only applies on devices that can hover.
- **Selected** (`.is-selected`, `aria-pressed`, `aria-checked`): a 2 px inset `--accent` ring. Optionally add a `<SpecLabel variant="team">` badge ("Your look").
- **Loading:** put a `Skeleton` in `.ml-tile__media`. `CanvasImage` with `canvas={null}` does this for you. When a re-render is stale, use `loading`.
- **Error:** `CanvasImage error="…"`.

**Text never goes on top of artwork.** Captions go below the tile (`.ml-card__body`). In the hero they go in a glass pill in a corner.

**Corners:** badge top-left, one action top-right. Nothing else overlays the image.

**Render sizes:**

- Gallery tiles: 384–512 px, `quality: "preview"`.
- Tiles at or above 600 px: 1024 px.
- Exports: 2048 px.

### 4.5 Grids

```html
<div class="ml-grid ml-grid--3">…cards…</div>                         <!-- 3 → 2 cols at ≤860 -->
<div class="ml-grid ml-grid--4">…</div>                               <!-- 4 → 3 → 2 -->
<div class="ml-grid ml-grid--auto" style="--min: 220px">…</div>       <!-- auto-fill -->
<div class="ml-grid ml-grid--3 ml-grid--rail-sm">…</div>              <!-- grid on desktop, swipe rail on phones -->
```

The column gap is `--grid-gap` (tiles sit close, like a product wall). The row gap is `--space-6`, which leaves room for captions. Add `.ml-grid--tight` for an image-only wall.

### 4.6 Rail (horizontal carousel)

```jsx
<div className="ml-rail" ref={rail}>{looks.map(…card…)}</div>
```

- The rail sits inside `.container`, bleeds to the viewport edge and snaps to tiles.
- Each item is `clamp(200px, 21vw, 300px)` wide (68vw on phones); override with `--rail-item`.
- Show a partial tile at the edge so people can tell it scrolls.
- Put the arrows in the section head: two `IconButton variant="secondary"` inside `.ml-rail-nav`, which call `rail.scrollBy({ left: ±0.8 × clientWidth, behavior: "smooth" })`. Hide them on phones, where swipe is native.
- A filter `ChipRow scroll` goes between the section head and the rail.

### 4.7 Canvas plus inspector side panel (Studio, Collection editor)

```jsx
<div className="ml-split">                         {/* 1fr | 380px; one column at ≤1024 */}
  <div className="ml-tile ml-tile--hero ml-tile--mid" style={{ "--tile-pad": "12%" }}>…preview…</div>
  <aside className="ml-panel ml-panel--sticky" aria-label="Look settings">
    <div className="ml-panel__group">…title (t-title-3) + SpecLabel box + blurb…</div>
    <div className="ml-panel__group">
      <div className="ml-panel__head"><span className="ml-panel__title">Adjust</span><Button variant="ghost" size="sm">Reset</Button></div>
      <Slider … /> <Slider … />
    </div>
    …
  </aside>
</div>
```

- Groups are separated by a hairline and `--space-5`, never by boxes.
- Group titles are 14/600 sentence case.
- The panel's primary action sits at the bottom as `Button variant="team" size="lg" block`.
- `.ml-split--left` puts the panel on the left; set the width with `--panel-w`.
- The preview tile should not get taller than the viewport: `max-height: calc(100dvh - var(--header-h) - 48px)` with a matching width.
- **Controls over the preview:**
  - glass IconButtons top-right (shuffle, reset);
  - a Segmented control bottom-left (Artwork / On product), on a translucent white pill over dark stages;
  - backdrop swatches bottom-right.
- On phones the inspector becomes a `Sheet` (a bottom sheet) or flows under the preview.

### 4.8 Sticky bottom CTA bar (phones)

```jsx
<div className="ml-sticky-bar" data-hidden={ctaOnScreen}>
  <div className="ml-sticky-bar__sum"><strong>$2,743</strong><span>72 pieces · Graffiti</span></div>
  <Button variant="team" iconRight={<ArrowRight />}>Review order</Button>
</div>
```

- Show it only at ≤720 px.
- Only show it once the page's own CTA has scrolled out of view: watch that CTA with an `IntersectionObserver` and set `data-hidden` to true while it is visible. Example: `PhoneBar` in `harness/design.js`.
- It is glass with `--shadow-sticky` and respects the safe area.
- Use one bar per page, with the page's single forward action.

### 4.9 Forms

```jsx
<div className="form-grid">                                   {/* grid, gap var(--space-4); 2–3 cols ≥ 720, 1 col on phones */}
  <Field label="School"><Input /></Field>
  <Field label="Coach email" required error={err}><Input type="email" /></Field>
  <Field label="Phone" optional><Input type="tel" /></Field>
</div>
```

- Inputs are filled, 44 px tall, with radius 12 and a hairline. On focus they turn page-white with a blue ring and halo. Errors get a red edge plus a message below with an icon.
- Labels are 14/500 above the field. "Optional" is written in `--ink-3`. Hints are 14 px `--ink-2` below.
- Don't use placeholder-as-label.
- Group related fields with spacing and a `.t-headline`, not with a box.
- Inside a tile, add `.ml-on-tile` so fields switch to page white.
- Checkboxes and radios are 20 px with the accent fill. Toggles are for settings that apply right away.

### 4.10 Tables and rosters

```jsx
<div className="ml-table-wrap">
  <table className="ml-table ml-table--hover">
    <thead><tr><th>Player</th><th className="is-num">No.</th><th>Top</th><th>Bottom</th></tr></thead>
    <tbody><tr><td>J. Carter</td><td className="is-num">0</td><td><SpecLabel mono size="lg">L</SpecLabel></td>…</tr></tbody>
  </table>
</div>
```

- Header cells are 12/500 `--ink-2` in sentence case (not mono, not uppercase).
- Rows have hairline separators, 12 px padding and no zebra striping. Numbers are right-aligned and tabular.
- Cells don't wrap; the wrapper scrolls instead. Add `td.is-wrap` to opt a cell out.
- Row numbers in `--ink-3`.
- Inline controls (Select, NumberStepper size `sm`) sit in the row without their own borders.
- **On phones**, use stacked rows instead of the table. Don't make a phone user scroll a seven-column table sideways. Render both and let `.ml-hide-phone` / `.ml-only-phone` swap them:

  ```jsx
  <ul className="ml-rows ml-only-phone">
    <li className="ml-row">
      <span className="ml-row__lead">01</span>
      <span className="ml-row__main"><span className="ml-row__title">J. Carter · #0</span><span className="ml-row__meta">Top L · Bottom L · 6 pieces</span></span>
      <span className="ml-row__end"><IconButton size="sm" label="Edit J. Carter" icon={<ChevronRight />} /></span>
    </li>
  </ul>
  ```

  `.ml-rows` also fits order lines and settings lists on any width.
- **Summary card:** a `--tile` card with radius-xl and 32 px padding.
  - A `.t-headline` title.
  - `.ml-dl` key/value rows.
  - The total: `.t-subhead` label against a 38 px Geist 600 tabular figure, with a `--line-strong` hairline above.
  - Then the team CTA.

### 4.11 Empty, loading and error states

```jsx
<div className="ml-empty">                                  {/* add ml-empty--error for failures */}
  <span className="ml-empty__icon"><Users /></span>
  <p className="ml-empty__title">No players yet</p>
  <p className="ml-empty__text">Paste a list from a spreadsheet or add players one by one.</p>
  <div className="ml-empty__actions"><Button size="sm">Paste roster</Button><Button size="sm" variant="outline">Add a player</Button></div>
</div>
```

- **Loading:** show the layout's own skeleton (tiles plus text lines), never a spinner on a blank page. Spinners only appear inside buttons (`loading`) and over stale images.
- **Errors:** say what happened and what to do, in sentence case, with one action.
- **Inline messages:** use `Notice` (info, warning, success, danger). It has a tinted fill and no side bar.
- **Transient confirmations:** use `useToast()`. Toasts are ink-colored in light and raised grey in dark, with a tone icon.

### 4.12 Overlays

- **`Modal`:** a centered dialog with radius 20 and `--shadow-modal`. Title 22–28 / 600. A `kicker` is a small `--ink-2` line. Footer buttons sit on the right: secondary, then primary.
- **`Sheet`:** a floating side panel (8 px inset, radius 20).
- On phones both become bottom sheets with a grab handle.
- Use `useConfirm()` instead of `confirm()`.

---

## 5. Components

How to choose, and what each component looks like now. The APIs are unchanged. Everything is still exported from `ui/components/index.js`.

- **`Button`.** All buttons are pills in sentence case, weight 500. Sizes: `sm` 36, `md` 44, `lg` 52; on touch devices the minimum is 40.

  | Variant | Look | Use |
  | --- | --- | --- |
  | `primary` | Ink fill | The default action |
  | `team` | Accent fill | The single most important forward step on the page ("Put it on the kit", "Order this collection", "Review order"). One per page. |
  | `secondary` | Tile fill | Second action |
  | `outline` (new) | Hairline ring | Use on tiles |
  | `ghost` | Text only | Tertiary, "Reset", "Try the sample →" |
  | `glass` (new) | Translucent and blurred | Over imagery |
  | `danger` | Danger fill | Destructive actions |

- **`IconButton`:** circular, sizes 32 / 40 / 48. Variants: ghost, secondary, outline, glass (new), primary. `pressed` gives the accent fill.
- **`Chip`:** a pill on the tile fill; selected is an ink fill. Use for filters and presets. `ChipRow scroll` makes a one-line scroller on phones.
- **`Segmented`:** a tile track with a white thumb (`--control-on` in dark). Use for view switches (Front / Back, Artwork / On product, drop style). The `mono` prop is ignored now.
- **`Tabs`:** 15/500 with a 2 px ink underline. Use for in-page panels.
- **`Slider`:** a thin track with the accent fill and a white knob. The value is shown as 14 px tabular text, top-right.
- **`Toggle`:** an iOS-style switch with the accent fill.
- **`ColorField`:** round swatches, a hex pill in Geist Mono, and a color-wheel picker.
- **`NumberStepper`:** a filled pill with circular − and + buttons.
- **`SpecLabel`:** now quiet meta text: 12 px Geist, `--ink-2`, no caps.
  - `mono` (new) is for real codes.
  - `variant="box"` gives a neutral pill badge. On a tile it switches to page white.
  - `solid`, `team`, `warning` and `success` give pill badges.
  - `size="lg"` (14 px) is the eyebrow size.
- **`Swatch`:** a rounded square (or `shape="round"`). Selected gets a page gap plus an ink ring.
- **`TeamChip`:** the team pill. A round logo thumbnail, the name, three color dots and a "Sample" tag.
- **`StepNav`:** minimal tabs. A thin team-colored indicator slides to the current step. The compact variant (phones) shows "Collection 2/3" over three segments, and renders nothing before the flow starts (step 0).
- **`Wordmark`:** a crest monogram plus MASCOT LAB in Archivo Wide (MASCOT in 800, LAB in 400). Sizes sm, md, lg, xl; `mark={false}` gives the text only. `RegMark` is retired and renders nothing.
- **`CanvasImage`:** its radius comes from `--canvas-radius` (default 12). Set it to 0 inside tiles; `.ml-tile__media` does that for you. It fades in over 320 ms.
- **`Notice`, `Toast`, `Modal`, `Sheet`:** see §4.11 and §4.12.

---

## 6. Do and don't

**Do**

- Put every image on a studio tile, with the correct stage and padding.
- Give one primary action per view, and use `team` for at most one button per page.
- Separate groups with space. Use a hairline only where rows need it.
- Use sentence case for headings, buttons, labels and table heads.
- Use tabular figures for numbers that change.
- Reserve `.t-hero` and `.t-display*` for one or two big statements per page.
- Test at 390 px and 1440 px, light and dark, with `?team=lemon` (yellow) and `?team=ember` (red on black).
- Keep touch targets at 40 px or more on phones. The components already do.

**Don't**

- No mono labels except true metadata (hex, style codes, sizes). No `font-family: var(--font-mono)` with uppercase and letter-spacing as a "label" style.
- No boxed sections. No 2 px ink rules, no dashed borders, no `--shadow-card` around every panel, no cards inside cards.
- No uppercase body copy, buttons, tabs or table heads. No condensed type.
- No team color as decoration: no stripes on headers, dialogs or panels, no team-colored headings, no team-tinted backgrounds.
- No crop marks, registration marks, court lines, offset shadows or "FX 01" index numbers on tiles.
- No text over artwork (badges and actions go in the corners only).
- No more than one weight jump per element. Geist runs 400 / 500 / 600; never use 800 or 900 on Geist.
- No new colors or raw hex in page CSS.

---

## 7. Imagery checklist

| | Effects / logos | Garments |
| --- | --- | --- |
| Tile | `.ml-tile` plus the stage class from `effect.stage` | `.ml-tile--product` |
| Ratio | 1:1 | 4:5 (lookbook, product cards), 1:1 in tight grids |
| Padding | 10–12% (`--tile-pad`) | `6% 4%` |
| Radius | 16 (`--radius-lg`); 20 for the hero | same |
| Hover | Image scales 1.03 plus `--shadow-hover` | same |
| Selected | 2 px inset `--accent` ring, plus a "Your look" team badge | n/a (show the edit state in the inspector) |
| Caption | Below the tile: name 15/500, then `Category · Method` 14 in `--ink-2` | Name, then `Drop style · Fabric`, then the price |
| Loading | Skeleton in place, same ratio | same |

---

## 8. Accessibility

- **Contrast:** `--ink-2` passes AA on the page and on tiles in both themes. `--ink-3` is decorative only. `--accent` is the store's readable team color, at least 3:1 against the page (use it for UI, not paragraph text).
- **Focus:** a 2 px `--focus` outline with a 2–3 px offset on everything. Inputs get a ring plus a halo. Never remove focus without replacing it.
- **Touch:** controls are at least 40 px at ≤720 px or with a coarse pointer (see the media block at the end of `components.css`). Inputs use a 16 px font so iOS doesn't zoom.
- **Motion:** `prefers-reduced-motion` turns off animation globally. Don't use JS-driven animation that ignores it.
- **Selection:** never show selection by color alone. Selected chips and swatches get a check, and selected tiles get a badge.

---

## 9. Fonts and canvases

- `src/styles/fonts.css` declares Geist (latin and latin-ext), Geist Mono (latin), **Archivo Wide** and **Archivo Condensed**. Both Archivo families use the same variable file. A face whose `font-stretch` descriptor is a single value pins the width axis there, so the family name carries the width.
- Fine-tune Archivo's width with `font-variation-settings: "wdth" 112`.
- Canvases need fonts loaded before they draw: `await document.fonts.load('900 64px "Archivo Wide"')`.
- **Still on the old faces, kept loading in `main.jsx` on purpose:**
  - The **ascii effect** draws with IBM Plex Mono. The render worker gets the files from `engine/worker/pool.js`, and the main-thread fallback gets them from `main.jsx`. Keep both, or move both to Geist Mono together.
  - `ui/collection/lineSheet.js` and `exports.js` draw with Big Shoulders, static Archivo and Plex Mono. Whoever restyles the line sheet should move it to Archivo Wide, Geist and Geist Mono, then drop those imports from `main.jsx`.

---

## 10. Migrating a page (checklist)

The old token names now point at the new values, so unconverted pages still render. The legacy display face keeps its old widths, so nothing overflows.

| Old | Now | What to write instead |
| --- | --- | --- |
| `--bg`, `--surface` | `--page` | `--page`; group content with spacing or a `--tile` |
| `--surface-2` / `-3` | `--tile` / `--tile-strong` | same |
| `--surface-inverse` | `--ink-fill` | `--ink-fill` |
| `--font-display` | **Archivo Condensed** (legacy alias, same widths as Big Shoulders) | `.t-display*` / `--font-wide` for statements, Geist 600 for titles |
| `--font-body` | Geist | `--font-sans` |
| `--font-mono` + uppercase + `--tracking-mono` | Geist Mono, tracking 0.01em | `.t-eyebrow`, `.t-caption`, `SpecLabel` (sans); `.t-meta` only for codes |
| `--step--2 … --step-6` | Remapped (12, 13–14, 16, 17–20, 22–28, 26–38, 32–52, 36–64, 40–92) | `--text-*` or the `.t-*` roles |
| `--radius-xs/sm/md/lg` | 4 / 8 / 12 / 16 | same names, plus `--radius-xl`, `-2xl`, `-pill` |
| `--rule` | 1 px | hairline `--line`, not `--ink` |
| `--shadow-card` | Hairline ring | spacing or a tile instead |
| `.label`, `.mono-label` | Quiet 12 px sans meta | `.t-eyebrow` / `.t-meta` |
| `.display` | `.t-display` | `.t-display` |
| `.crop-marks`, `<RegMark>` | Inert (the class only positions; RegMark renders nothing) | delete them |

**Per page:**

1. Delete crop marks, `RegMark`, decorative team stripes, "FX 00" counters and 2 px ink rules.
2. Change every `font-family: var(--font-mono)` label to sans meta or eyebrow text. Keep mono only for hex, style codes and sizes.
3. Change `font-family: var(--font-display)` with weight 800/900 and uppercase to Geist 600 in sentence case. Use `.t-display-sm` for at most one big number or statement.
4. Turn boxed panels into spaced groups (`.ml-panel__group`) or tiles. Use `--shadow-card` only when a white card truly needs an edge on white.
5. Put images on `.ml-tile` with the right stage, ratio and padding. Move captions below the tile.
6. Give the one forward CTA `Button variant="team" size="lg"`. On phones it also goes in an `.ml-sticky-bar`.
7. Check 390 px and 1440 px, light and dark, `?team=lemon` and `?team=ember`, keyboard focus, and that there is no horizontal scroll.

**Outside this design pass:**

- `index.html` still sets `theme-color` to `#ECEFF3`. It should be `#FFFFFF` (light) and `#0A0A0C` (dark).
- `order/orderSheet.js` prints with Big Shoulders in its own HTML document.
