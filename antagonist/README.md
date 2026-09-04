# ANTAGONIST — Nike Basketball Apparel seasonal creative-direction platform

An internal, scroll-driven world for a seasonal creative direction. The current
season is **ANTAGONIST / RAGE BAIT / MAKE 'EM MAD.** The platform is built so
the next season is a content change, not a rebuild.

```
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
```

Stack: Next.js 15 (App Router) · React 19 · TypeScript · GSAP + ScrollTrigger ·
Lenis smooth scroll · three.js / React Three Fiber (two WebGL moments only).
Type: Archivo (variable width axis) and IBM Plex Mono via `next/font`, both
open-licence. No proprietary Nike fonts are packaged or imitated.

---

## 1. Where content is edited

**Everything is in `content/season.ts`.** It exports one `SeasonConfig`
(schema in `content/types.ts`). Each act reads from it; nothing is hard-coded
in components except the interaction mechanics.

| Key | Drives |
| --- | --- |
| `meta` | brand, division, season code, platform name, chapter, attitude line, subtitle. Used in the chrome, metadata, Act 03 title, Act 07 credits. |
| `palette` | `ink`, `paper`, `accent`, `clash`, `mute`. Injected as CSS variables in `app/layout.tsx`; also passed to both shaders. |
| `chapters` | act order, indices and titles shown in the chrome and the act index (menu). Ids must match the `id="act-…"` on each act section. |
| `entry` | Act 00: noise fragments (with 0..1 stage positions), the three-line statement, the reveal word, scroll hint. |
| `reaction` | Act 01: headline lines, axis labels (love / hate / centre / neutral), reveal line, closing lines. |
| `archetypes` | Act 02: name, broadcast headline, quote, behaviours, `tone` (drives the environment colour), portrait + archive media slots. |
| `ragebait` | Act 03: insight lines, word list, comment pool, peak line, silence line, counter label. |
| `principles` | Act 04: index, title, statement, explanation, on-stage prompt, and which built-in `interaction` demonstrates it. |
| `product` | Act 05: intro lines and ten lenses. Each lens carries copy, a media slot and an `object` state (proportion, graphic, hue, grain, trim, mark, layer, tilt) that the WebGL garment tweens to. |
| `worlds` | Act 06: four worlds with question, provocations, palette, media. |
| `athletes` / `rivalries` | Act 06: athlete voices (the ATHLETES world) and the NBA scoreboard rivalries. |
| `exit` | Act 07: line groups, attitude line, credit lines. |

## 2. Where imagery is replaced

Every image/video slot is a `MediaAsset` created with the `slot()` helper in
`content/season.ts`. While `src` is undefined the `Placeholder` component
(`components/system/Placeholder.tsx`) renders a labelled procedural frame that
prints the slot's `id` and `label` on screen, so anyone can find it in the config.

To replace one:

1. Drop the file into `public/assets/`.
2. Set `src: "/assets/your-file.jpg"` (or `kind: "video"` + `poster`) on the slot.
3. Optionally set `ratio` (CSS aspect ratio) and `alt`.

The `treatment` field (`grain | scan | halftone | blur | flat`) only affects the
empty placeholder and is ignored once `src` is set.

The Act 05 garment and the Act 00 tunnel are procedural (no textures) by design;
they are directions, not product.

## 3. Component structure

```
app/
  layout.tsx           fonts, metadata, palette → CSS variables
  page.tsx             composes the acts in order
  globals.css          tokens, type system (.t-display / .t-wide / .t-body / .t-mono), helpers
content/
  types.ts             SeasonConfig schema
  season.ts            THE season file
lib/
  gsap.ts              GSAP + ScrollTrigger registration
  hooks.ts             useGsap (scoped contexts), useReducedMotion, useCoarsePointer, useWebGL
  utils.ts             clamp / lerp / seeded random (deterministic placeholders)
components/system/
  SmoothScroll.tsx     Lenis driven by GSAP's ticker; disabled under reduced motion
  SoundSystem.tsx      procedural WebAudio arena bed + cues; muted by default, toggle + "M" key
  Chrome.tsx           season mark, live act label, sound toggle, progress line, act index
  Placeholder.tsx      replaceable media slot
components/webgl/
  TunnelCanvas.tsx     Act 00 full-screen fragment shader (raw three.js, one draw call)
  GarmentScene.tsx     Act 05 R3F scene: procedural garment with custom vertex/fragment shaders
components/acts/
  Act00Tunnel.tsx      entry: noise → cut → statement → reveal → burst
  Act01Reaction.tsx    LOVE ↔ HATE attention field (canvas 2D) with slider
  Act02Antagonist.tsx  mutating environment for six archetypes
  Act03RageBait.tsx    escalation to overload, hard cut, silence
  Act04Codes.tsx       five interactive code chapters (codes/Chapter.tsx, codes/Interactions.tsx)
  Act05Product.tsx     persistent object + ten scrolling lenses
  Act06Worlds.tsx      horizontal track of four worlds (stacked on touch)
  Act07Exit.tsx        timed exit sequence
```

Each act is a `<section id="act-…" data-theme="dark|light">` and owns its own
motion inside a scoped `useGsap` context, so it can be removed, reordered or
duplicated without touching the others.

## 4. How motion works

- **One clock.** Lenis runs on `gsap.ticker`; ScrollTrigger listens to Lenis.
  All pins are standard ScrollTrigger pins (`pin`, `scrub`), which is why they
  survive resize and font loading.
- **Scrubbed timelines** (Acts 00, 02, 03) map scroll progress to a timeline so
  every beat is reversible. Discrete cuts use `.set()` on purpose: the removal in
  Act 03 is a cut, not a fade.
- **Refs, not state, on scroll.** Anything updated per scroll tick (counter,
  strip position, shader targets) is written to refs / DOM directly. React state
  only changes at chapter boundaries.
- **WebGL is selective.** Two hero moments: the tunnel (Act 00) and the garment
  (Act 05). Both are lazy-loaded with `next/dynamic`, run only while on screen,
  cap device pixel ratio, and have CSS fallbacks when WebGL is unavailable.
- **Object ↔ scroll sync (Act 05).** Lens ScrollTriggers write a target state to
  a ref; `useFrame` eases the shader uniforms toward it every frame.
- **Rhythm.** Acts alternate quiet (01 headline, 03 insight, 03 silence, 07) and
  pressure (00 burst, 03 overload, 06 track). Not everything moves.
- **Reduced motion.** `prefers-reduced-motion` disables Lenis and every pin;
  each act renders a static, readable layout instead.
- **Touch.** Hover interactions have scroll-driven equivalents (the fracture in
  code 01, the auto-lock in 02, the sweep in 04); drags use pointer events with
  `touch-action` set appropriately; the four worlds stack vertically under 900px.
- **Keyboard.** Skip link, slider roles with arrow keys, hold-to-lock on
  space/enter, tab roles for athletes, focusable drag surfaces.
- **Sound.** Off by default. The toggle (or `M`) starts a procedural arena bed;
  acts push a hostility level and fire cues (flash, boo, cut). No audio files.

## 5. Creating next season's theme

1. Copy `content/season.ts` to `content/seasons/<name>.ts` (or edit in place).
2. Change `meta`, `palette`, `chapters` titles and every copy block.
3. Rewrite `archetypes`, `principles`, `product.lenses`, `worlds`, `athletes`,
   `rivalries` to the new idea. The shapes are typed; `npm run typecheck` will
   tell you what is missing.
4. Point `content/season.ts`'s default export at the new file.
5. If a principle needs a new demonstration, add an interaction to
   `components/acts/codes/Interactions.tsx` and a new `interaction` value in
   `content/types.ts`. The `Chapter` wrapper already handles reveal timing,
   scroll fallback and reduced motion.
6. If the season's object should behave differently, adjust the uniforms in
   `GarmentScene.tsx`; the lens `object` fields are the only contract with the
   content file.

## Notes

- Placeholder copy (comments, quotes, headlines) is original and written for the
  prototype. Archetype references are inspiration for an attitude, not imagery.
- No third-party imagery is bundled. Placeholders are abstract procedural forms.
- `npm run build` is the validation used for this prototype (typecheck + static
  export of the single route).
