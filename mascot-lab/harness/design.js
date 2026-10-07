// Mascot Lab — "Studio" direction showcase (dev-only). A mock landing page and the
// tool surfaces, built only from the shared tokens, components and pattern classes, with
// real renders: the sample bulldog through the effect engine and the current garment
// mockups. Plain JS (no JSX) so it runs as-is from harness/.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, ClipboardPaste, Heart, ImagePlus, Plus, RotateCcw, Shuffle,
  Upload, Users,
} from "lucide-react";

import "../src/styles/fonts.css";
import "../src/styles/tokens.css";
import "../src/styles/global.css";
import "../src/ui/components/components.css";
import "../src/ui/components/shell.css";

import {
  Button, IconButton, Field, Input, Select, Slider, Toggle, Segmented, Chip, ChipRow, ColorField, NumberStepper,
  SpecLabel, Swatch, Skeleton, CanvasImage, Notice, Wordmark, StepNav, TeamChip, ThemeSwitch, CopyText,
} from "../src/ui/components/index.js";
import { teamCssVars } from "../src/state/store.jsx";
import { DEFAULT_SAMPLE } from "../src/assets/samples/index.js";
import { prepareLogo } from "../src/engine/image.js";
import { getEffect, CATEGORIES } from "../src/engine/effects/index.js";
import { renderEffect } from "../src/engine/render.js";
import { PRODUCTS } from "../src/order/catalog.js";

const h = React.createElement;
const F = React.Fragment;
const q = new URLSearchParams(location.search);

const TEAMS = {
  northgate: { school: "Northgate", mascot: "Bulldogs", palette: DEFAULT_SAMPLE.palette },
  ember: { school: "Riverside", mascot: "Embers", palette: { primary: "#C8102E", secondary: "#111111", accent: "#FFFFFF", dark: "#0B0D10", light: "#F4F5F7" } },
  forest: { school: "Lakeview", mascot: "Pines", palette: { primary: "#0F5132", secondary: "#E8E3D3", accent: "#C9A227", dark: "#0B1410", light: "#F5F3EC" } },
  lemon: { school: "Sunnyside", mascot: "Bees", palette: { primary: "#FFD100", secondary: "#FFFFFF", accent: "#F2F2F2", dark: "#1A1A1A", light: "#FFFBEA" } },
};
const TEAM = TEAMS[q.get("team")] || TEAMS.northgate;
const PALETTE = TEAM.palette;
const HERO_FX = q.get("hero") || "chrome";
const LOOK_FX = q.get("look") || "graffiti";
const RAIL_FX = ["graffiti", "chrome", "halftone", "neon", "screenprint", "holographic", "stencil", "thermal", "chenille", "risograph", "glitch", "varsity"];
const LOOKBOOK = ["hoodie", "jersey", "shorts"];
const STEP = Math.max(0, Math.min(4, Number(q.get("step") ?? 0) || 0));

const theme = q.get("theme");
if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
for (const [k, v] of Object.entries(teamCssVars(PALETTE))) document.documentElement.style.setProperty(k, v);

const STAGE_TILE = { paper: "ml-tile--paper", dark: "ml-tile--dark", mid: "ml-tile--mid", team: "ml-tile--team" };
const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || "";

/* ───────────────────────────── renders ───────────────────────────── */

async function renderLook(id, logo, size, quality = "final") {
  const eff = await getEffect(id);
  if (!eff) return null;
  const canvas = await renderEffect(eff, logo, {}, PALETTE, { size, seed: 7, quality, logoKey: "design-bulldog" });
  return { id, name: eff.name, method: eff.method, category: eff.category, stage: eff.stage, blurb: eff.blurb, canvas };
}

/** The current garment mockups (garment rendering is being rebuilt — fail soft). */
async function renderGarments(ids, art, clean, size) {
  try {
    const [{ renderMockup, fontsReady }, { loadGarments }, { buildCollection, resolveColors }] = await Promise.all([
      import("../src/apparel/renderMockup.js"),
      import("../src/apparel/garments/index.js"),
      import("../src/apparel/collection.js"),
    ]);
    await fontsReady();
    const garments = await loadGarments();
    const collection = buildCollection("statement", PALETTE, { effectStage: art.stage });
    const out = {};
    for (const id of ids) {
      const g = garments.find((x) => x.id === id);
      const item = collection.items[id];
      if (!g || !item) continue;
      try {
        const colors = resolveColors(item.colors, PALETTE);
        const graphics = (item.front || []).map((p) => ({ ...p, canvas: p.source === "logo" ? clean : art.canvas }));
        const text = item.text && { name: null, number: item.text.number ? "23" : null, fill: colors.accent, outline: colors.trim };
        out[id] = renderMockup(g, "front", { size, colors, graphics, text, backdrop: null, shadow: true });
      } catch (e) {
        console.warn(`[design] ${id} mockup failed:`, e.message);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    return out;
  } catch (e) {
    console.warn("[design] garment renderer unavailable:", e.message);
    return {};
  }
}

function useAssets() {
  const [a, setA] = useState({ logo: null, hero: null, look: null, rail: {}, garments: {}, done: false });
  useEffect(() => {
    let live = true;
    const patch = (p) => live && setA((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));
    (async () => {
      const logo = (await prepareLogo(DEFAULT_SAMPLE.url)).canvas;
      patch({ logo });
      const [hero, look] = await Promise.all([renderLook(HERO_FX, logo, 1024), renderLook(LOOK_FX, logo, 1024)]);
      patch({ hero, look });
      const clean = (await renderLook("original", logo, 1024))?.canvas || logo;
      const garmentsP = renderGarments(LOOKBOOK, hero || look, clean, 1100).then((garments) => patch({ garments }));
      for (const id of RAIL_FX) {
        const r = await renderLook(id, logo, 512).catch((e) => { console.warn(`[design] ${id}:`, e.message); return null; });
        if (r) patch((s) => ({ rail: { ...s.rail, [id]: r } }));
      }
      await garmentsP;
      await (document.fonts?.ready || Promise.resolve());
      patch({ done: true });
      setTimeout(() => { window.__READY = true; }, 400);
    })().catch((e) => { console.error("[design] render failed", e); window.__READY = true; });
    return () => { live = false; };
  }, []);
  return a;
}

/* ───────────────────────────── page ───────────────────────────── */

function Header({ logo }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 2);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return h("header", { className: "ml-header" + (scrolled ? " is-scrolled" : "") },
    h("div", { className: "ml-header__inner" },
      h("div", { className: "ml-header__brand" }, h(Wordmark, { href: "#" })),
      h(StepNav, { current: STEP, className: "ml-header__steps" }),
      h("div", { className: "ml-header__end" },
        h(StepNav, { current: STEP, variant: "compact", className: "ml-header__compact" }),
        h(TeamChip, { className: "ml-header__team", team: { ...TEAM, isSample: true }, palette: PALETTE, logoCanvas: logo, href: "#", title: "Edit logo and colors" }))));
}

function Hero({ a }) {
  const hoodie = a.garments.hoodie;
  return h("section", { className: "container ds-hero", "aria-labelledby": "ds-hero-t" },
    h("div", { className: "ds-hero__top" },
      h("div", { className: "ds-hero__titles" },
        h("p", { className: "t-eyebrow" }, "Team apparel, made from your logo"),
        h("h1", { className: "t-hero", id: "ds-hero-t" }, "Your logo.", h("br"), "Every look.")),
      h("div", { className: "ds-hero__aside" },
        h("p", { className: "t-lead" }, "Upload your mascot, remix it through 23 ", h("span", { style: { whiteSpace: "nowrap" } }, "print-shop"), " looks, and see it on the whole kit before you order for the roster."),
        h("div", { className: "ds-ctas", id: "ds-hero-ctas" },
          h(Button, { variant: "team", size: "lg", icon: h(Upload, { "aria-hidden": true }) }, "Upload your logo"),
          h(Button, { variant: "ghost", size: "lg", iconRight: h(ArrowRight, { "aria-hidden": true }) }, "Try the sample")),
        h("p", { className: "t-caption muted" }, "PNG, JPG, SVG or WebP. Nothing leaves your browser until you order."))),
    h("div", { className: "ds-hero__media" },
      h("figure", { className: `ml-tile ml-tile--hero ${STAGE_TILE[a.hero?.stage] || "ml-tile--dark"} ds-hero__art` },
        h("div", { className: "ml-tile__media" }, h(CanvasImage, { canvas: a.hero?.canvas || null, ratio: 1, alt: `${TEAM.mascot} logo, ${a.hero?.name || "effect"} look` })),
        h("figcaption", { className: "ds-cap" + (a.hero?.stage === "dark" || a.hero?.stage === "team" ? " ds-cap--dark" : "") },
          h("span", { className: "ds-cap__pill" }, h("strong", null, a.hero?.name || "Rendering…"), h("span", null, a.hero ? `Look 02 · ${a.hero.method}` : "Live in your colors")))),
      h("figure", { className: "ml-tile ml-tile--hero ml-tile--product ds-hero__product" },
        h("div", { className: "ml-tile__media" }, hoodie ? h(CanvasImage, { canvas: hoodie, ratio: 1, alt: "Warm-up hoodie with the look" }) : h(Skeleton, { variant: "square", style: { width: "70%" } })),
        h("figcaption", { className: "ds-cap" },
          h("span", { className: "ds-cap__pill" }, h("strong", null, PRODUCTS.hoodie.name), h("span", null, `Statement drop · $${PRODUCTS.hoodie.price}`)),
          h(Button, { variant: "glass", size: "sm", iconRight: h(ArrowRight, { "aria-hidden": true }) }, "See the kit")))));
}

function LooksRail({ a }) {
  const rail = useRef(null);
  const [cat, setCat] = useState("all");
  const counts = { print: 6, street: 4, metal: 3, retro: 5, digital: 5 };
  const scroll = (d) => rail.current?.scrollBy({ left: d * rail.current.clientWidth * 0.8, behavior: "smooth" });
  return h("section", { className: "container ml-section", "aria-labelledby": "ds-looks-t" },
    h("div", { className: "ml-section-head" },
      h("div", { className: "ml-section-head__text" },
        h("h2", { className: "ml-section-head__title", id: "ds-looks-t" }, "23 looks. One logo."),
        h("p", { className: "ml-section-head__sub" }, "Every tile is your mascot, rendered live in your team colors.")),
      h("div", { className: "ml-rail-nav ds-hide-phone" },
        h(IconButton, { label: "Previous looks", icon: h(ChevronLeft), variant: "secondary", onClick: () => scroll(-1) }),
        h(IconButton, { label: "Next looks", icon: h(ChevronRight), variant: "secondary", onClick: () => scroll(1) }))),
    h(ChipRow, { scroll: true, label: "Filter looks", style: { marginBottom: "var(--space-5)" } },
      h(Chip, { selected: cat === "all", showCheck: false, count: 23, onClick: () => setCat("all") }, "All"),
      ...CATEGORIES.map((c) => h(Chip, { key: c.id, selected: cat === c.id, showCheck: false, count: counts[c.id], onClick: () => setCat(c.id) }, c.label)),
      h(Chip, { icon: h(Heart, { "aria-hidden": true }), showCheck: false }, "Favorites")),
    h("div", { className: "ml-rail", ref: rail },
      RAIL_FX.map((id, i) => {
        const r = a.rail[id];
        const selected = id === LOOK_FX;
        return h("a", { key: id, className: "ml-card", href: "#", "aria-label": r ? `${r.name}, ${r.method}` : "Loading look" },
          h("div", { className: `ml-tile ml-tile--interactive ${STAGE_TILE[r?.stage] || ""}${selected ? " is-selected" : ""}` },
            h("div", { className: "ml-tile__media" }, h(CanvasImage, { canvas: r?.canvas || null, ratio: 1, alt: "" })),
            selected && h("span", { className: "ml-tile__badge" }, h(SpecLabel, { variant: "team" }, h(Check, { size: 12, strokeWidth: 3, "aria-hidden": true }), "Your look"))),
          h("div", { className: "ml-card__body" },
            r ? h(F, null, h("span", { className: "ml-card__title" }, r.name), h("span", { className: "ml-card__meta" }, `${catLabel(r.category)} · ${r.method}`))
              : h(F, null, h(Skeleton, { variant: "text", style: { width: "50%" } }), h(Skeleton, { variant: "text", style: { width: "70%" } }))));
      })));
}

function Facts() {
  return h("section", { className: "container ml-section ds-facts", "aria-label": "Ordering facts" },
    h("div", { className: "ds-fact" }, h("span", { className: "t-display-sm" }, "12 pcs"), h("span", null, "Minimum order, mixed across the kit")),
    h("div", { className: "ds-fact" }, h("span", { className: "t-display-sm" }, "2 days"), h("span", null, "To a printed proof you approve")),
    h("div", { className: "ds-fact" }, h("span", { className: "t-display-sm" }, "YS–3XL"), h("span", null, "Every piece, youth and adult sizes")));
}

function Lookbook({ a }) {
  const meta = { hoodie: "Statement drop · Fleece", jersey: "Statement drop · Mesh", shorts: "Statement drop · Mesh" };
  return h("section", { className: "container ml-section", "aria-labelledby": "ds-kit-t" },
    h("div", { className: "ml-section-head" },
      h("div", { className: "ml-section-head__text" },
        h("h2", { className: "ml-section-head__title", id: "ds-kit-t" }, "The collection"),
        h("p", { className: "ml-section-head__sub" }, `Six pieces, one look. ${a.hero?.name || "Your look"} on the statement drop.`)),
      h("a", { className: "ml-link", href: "#" }, "See all six", h(ArrowRight, { "aria-hidden": true }))),
    h("div", { className: "ml-grid ml-grid--3 ml-grid--rail-sm" },
      LOOKBOOK.map((id, i) => {
        const p = PRODUCTS[id];
        const c = a.garments[id];
        return h("a", { key: id, className: "ml-card", href: "#" },
          h("div", { className: "ml-tile ml-tile--portrait ml-tile--product ml-tile--interactive" },
            h("div", { className: "ml-tile__media" }, c ? h(CanvasImage, { canvas: c, ratio: 1, alt: `${p.name} mockup` }) : h(Skeleton, { variant: "square", style: { width: "80%" } })),
            i === 0 && h("span", { className: "ml-tile__badge" }, h(SpecLabel, { variant: "box" }, "Most ordered")),
            h("span", { className: "ml-tile__action" }, h(IconButton, { label: `Favorite ${p.name}`, icon: h(Heart), variant: "glass", size: "sm" }))),
          h("div", { className: "ml-card__body" },
            h("span", { className: "ml-card__title" }, p.name),
            h("span", { className: "ml-card__meta" }, meta[id]),
            h("span", { className: "ml-card__price" }, `$${p.price}`)));
      })));
}

function StudioSection({ a }) {
  const [view, setView] = useState("art");
  const [preset, setPreset] = useState("Piece");
  const [fill, setFill] = useState(72);
  const [drips, setDrips] = useState(40);
  const [outline, setOutline] = useState(6);
  const [style, setStyle] = useState("fade");
  const [ink, setInk] = useState("secondary");
  const [bg, setBg] = useState(true);
  const look = a.look;
  return h("section", { className: "container ml-section", "aria-labelledby": "ds-studio-t" },
    h("div", { className: "ml-section-head" },
      h("div", { className: "ml-section-head__text" },
        h("h2", { className: "ml-section-head__title", id: "ds-studio-t" }, "Tune every look"),
        h("p", { className: "ml-section-head__sub" }, "Presets to start, sliders to finish. The kit updates as you go."))),
    h("div", { className: "ml-split" },
      h("div", { className: `ml-tile ml-tile--hero ${STAGE_TILE[look?.stage] || "ml-tile--mid"} ds-canvas` },
        h("div", { className: "ml-tile__media" }, h(CanvasImage, { canvas: look?.canvas || null, ratio: 1, alt: `${look?.name || "Effect"} preview` })),
        h("div", { className: "ds-canvas__tools" },
          h(IconButton, { label: "Shuffle", icon: h(Shuffle), variant: "glass" }),
          h(IconButton, { label: "Reset", icon: h(RotateCcw), variant: "glass" })),
        h("div", { className: "ds-canvas__bar" },
          h(Segmented, { label: "Preview", value: view, onChange: setView, options: [{ value: "art", label: "Artwork" }, { value: "product", label: "On product" }] }),
          h("div", { className: "ds-backdrops", role: "group", "aria-label": "Backdrop" },
            h(Swatch, { color: "#8A8F98", shape: "round", selected: true, onClick: () => {}, label: "Heather" }),
            h(Swatch, { color: PALETTE.primary, shape: "round", selected: false, onClick: () => {}, label: "Team" }),
            h(Swatch, { color: "#121316", shape: "round", selected: false, onClick: () => {}, label: "Black" })))),
      h("aside", { className: "ml-panel", "aria-label": "Look settings" },
        h("div", { className: "ml-panel__group" },
          h("div", { className: "ds-insp-head" },
            h("div", { className: "ds-insp-head__row" },
              h("h3", { className: "t-title-3" }, look?.name || "Graffiti"),
              h(SpecLabel, { variant: "box" }, look?.method || "Sublimation")),
            h("p", { className: "t-body-sm muted" }, look?.blurb || "A finished street piece: fade fill, 3-D block, drips."))),
        h("div", { className: "ml-panel__group" },
          h("div", { className: "ml-panel__head" }, h("span", { className: "ml-panel__title" }, "Presets")),
          h(ChipRow, { label: "Presets" }, ["Piece", "Chrome bomb", "Drip", "Throw-up"].map((p) => h(Chip, { key: p, selected: preset === p, onClick: () => setPreset(p) }, p)))),
        h("div", { className: "ml-panel__group" },
          h("div", { className: "ml-panel__head" }, h("span", { className: "ml-panel__title" }, "Adjust"), h(Button, { variant: "ghost", size: "sm" }, "Reset")),
          h(Select, { label: "Fill", value: style, onChange: setStyle, options: [{ value: "fade", label: "Team fade" }, { value: "chrome", label: "Chrome" }, { value: "flat", label: "Flat" }] }),
          h(Slider, { label: "Fill amount", value: fill, min: 0, max: 100, unit: "%", onChange: setFill }),
          h(Slider, { label: "Drips", value: drips, min: 0, max: 100, unit: "%", onChange: setDrips }),
          h(Slider, { label: "Outline", value: outline, min: 0, max: 12, unit: "px", onChange: setOutline })),
        h("div", { className: "ml-panel__group" },
          h(ColorField, { label: "Highlight ink", value: ink, onChange: setInk, palette: PALETTE, roles: ["primary", "secondary", "accent", "dark"] }),
          h(Toggle, { block: true, checked: bg, onChange: setBg, label: "Remove background", description: "Cuts out a plain backdrop behind the logo." })),
        h("div", { className: "ds-insp-foot" },
          h(Button, { variant: "team", size: "lg", block: true, iconRight: h(ArrowRight, { "aria-hidden": true }) }, "Put it on the kit"),
          h(Button, { variant: "ghost", block: true }, "Save to favorites")))));
}

const ROSTER = [
  ["J. Carter", 0, "L", "L"], ["M. Alvarez", 1, "M", "M"], ["D. Okafor", 3, "XL", "XL"], ["T. Nguyen", 4, "S", "S"], ["K. Brooks", 5, "L", "M"],
];
function OrderSection() {
  const [extra, setExtra] = useState(2);
  const sizes = ["YS", "YM", "YL", "S", "M", "L", "XL", "2XL", "3XL"].map((s) => ({ value: s, label: s }));
  return h("section", { className: "container ml-section", "aria-labelledby": "ds-order-t" },
    h("div", { className: "ml-section-head" },
      h("div", { className: "ml-section-head__text" },
        h("h2", { className: "ml-section-head__title", id: "ds-order-t" }, "Order for the roster"),
        h("p", { className: "ml-section-head__sub" }, "Sizes per player. The price updates as you go; the team discount starts at 24 pieces."))),
    h("div", { className: "ml-split" },
      h("div", { style: { minWidth: 0 } },
        h("div", { className: "ds-form" },
          h(Field, { label: "School" }, h(Input, { defaultValue: "Northgate High School" })),
          h(Field, { label: "Coach email", error: "Enter an email so we can send the proof." }, h(Input, { type: "email", defaultValue: "coach@" })),
          h(Field, { label: "Phone", optional: true }, h(Input, { type: "tel", placeholder: "(555) 010-2030" }))),
        h("div", { className: "ds-roster-tools" },
          h("h3", { className: "t-headline" }, "Roster ", h("span", { className: "muted", style: { fontWeight: 400 } }, "12 players")),
          h("div", { className: "cluster", style: { "--cluster-gap": "8px" } },
            h(Button, { variant: "secondary", size: "sm", icon: h(ClipboardPaste, { "aria-hidden": true }) }, "Paste roster"),
            h(Button, { variant: "ghost", size: "sm", icon: h(Plus, { "aria-hidden": true }) }, "Add player"))),
        h("ul", { className: "ml-rows ml-only-phone", "aria-label": "Roster" },
          ROSTER.map(([n, num, top, bot], i) => h("li", { key: n, className: "ml-row" },
            h("span", { className: "ml-row__lead" }, String(i + 1).padStart(2, "0")),
            h("span", { className: "ml-row__main" }, h("span", { className: "ml-row__title" }, `${n} · #${num}`), h("span", { className: "ml-row__meta" }, `Top ${top} · Bottom ${bot} · 6 pieces`)),
            h("span", { className: "ml-row__end" }, h(IconButton, { label: `Edit ${n}`, icon: h(ChevronRight), size: "sm" })))),
          h("li", { className: "ml-row" },
            h("span", { className: "ml-row__main" }, h("span", { className: "ml-row__title" }, "Extras for coaches"), h("span", { className: "ml-row__meta" }, "Hoodies, any size")),
            h("span", { className: "ml-row__end" }, h(NumberStepper, { label: "Extra hoodies", value: extra, onChange: setExtra, size: "sm" })))),
        h("div", { className: "ml-table-wrap ml-hide-phone" },
          h("table", { className: "ml-table ml-table--hover" },
            h("thead", null, h("tr", null, h("th", null, "Player"), h("th", { className: "is-num" }, "No."), h("th", null, "Top"), h("th", null, "Bottom"), h("th", { className: "is-num" }, "Pieces"))),
            h("tbody", null, ROSTER.map(([n, num, top, bot], i) =>
              h("tr", { key: n },
                h("td", null, h("span", { className: "ds-player" }, h("i", null, String(i + 1).padStart(2, "0")), n)),
                h("td", { className: "is-num" }, num),
                h("td", null, h(SpecLabel, { mono: true, size: "lg" }, top)),
                h("td", null, h(SpecLabel, { mono: true, size: "lg" }, bot)),
                h("td", { className: "is-num" }, "6")))),
            h("tfoot", null, h("tr", null, h("td", null, "Extras for coaches"), h("td"), h("td", { colSpan: 2 }), h("td", { className: "is-num" }, h(NumberStepper, { label: "Extra hoodies", value: extra, onChange: setExtra, size: "sm" }))))))),
      h("aside", { className: "ml-panel ml-panel--sticky", "aria-label": "Order summary" },
        h("div", { className: "ds-summary" },
          h("div", { className: "ds-insp-head__row" }, h("h3", { className: "t-headline" }, "Summary"), h(SpecLabel, null, "72 pieces · 12 players")),
          h("dl", { className: "ml-dl" },
            h("dt", null, "Six-piece kit × 12"), h("dd", null, "$3,048"),
            h("dt", null, "Volume discount · 10%"), h("dd", null, "−$304.80"),
            h("dt", null, "Printing & setup"), h("dd", null, "Included")),
          h("div", { className: "ds-tier" },
            h("div", { className: "ds-tier__bar", role: "img", "aria-label": "72 of 96 pieces toward the 15% tier" }, h("i")),
            h("div", { className: "ds-tier__legend" }, h("span", null, "24 · 5%"), h("span", null, "48 · 10%"), h("span", null, "96 · 15%"))),
          h("div", { className: "ds-summary__total" }, h("span", { className: "t-subhead" }, "Estimated total"), h("strong", null, "$2,743")),
          h(Button, { variant: "team", size: "lg", block: true, iconRight: h(ArrowRight, { "aria-hidden": true }) }, "Review order"),
          h("p", { className: "t-caption muted" }, "Nothing is charged online. We send a proof first.")))));
}

function States() {
  return h("section", { className: "container ml-section", "aria-labelledby": "ds-states-t" },
    h("div", { className: "ml-section-head" },
      h("div", { className: "ml-section-head__text" },
        h("h2", { className: "ml-section-head__title", id: "ds-states-t" }, "Loading, empty, error"),
        h("p", { className: "ml-section-head__sub" }, "The same tile, the same quiet type. Nothing shouts."))),
    h("div", { className: "ds-states" },
      h("div", { className: "ds-loading", "aria-label": "Loading tiles" },
        [0, 1, 2, 3].map((i) => h("div", { key: i, className: "ml-card" },
          h(Skeleton, { variant: "square", radius: "var(--radius-lg)" }),
          h(Skeleton, { variant: "text", style: { width: i % 2 ? "64%" : "48%" } })))),
      h("div", { className: "ml-empty" },
        h("span", { className: "ml-empty__icon" }, h(Users, { "aria-hidden": true })),
        h("p", { className: "ml-empty__title" }, "No players yet"),
        h("p", { className: "ml-empty__text" }, "Paste a list from a spreadsheet or add players one by one. Sizes can come later."),
        h("div", { className: "ml-empty__actions" }, h(Button, { size: "sm", icon: h(ClipboardPaste, { "aria-hidden": true }) }, "Paste roster"), h(Button, { size: "sm", variant: "outline" }, "Add a player"))),
      h("div", { className: "ml-empty ml-empty--error", role: "alert" },
        h("span", { className: "ml-empty__icon" }, h(AlertTriangle, { "aria-hidden": true })),
        h("p", { className: "ml-empty__title" }, "Couldn't read that file"),
        h("p", { className: "ml-empty__text" }, "Try a PNG, JPG, SVG or WebP under 15 MB."),
        h("div", { className: "ml-empty__actions" }, h(Button, { size: "sm", icon: h(ImagePlus, { "aria-hidden": true }) }, "Choose another file")))),
    h("div", { className: "ds-notices" },
      h(Notice, { title: "Sample logo loaded" }, "Upload your own any time. Your look and colors carry over."),
      h(Notice, { tone: "warning", title: "Logo is low resolution", onDismiss: () => {} }, "Large prints may look soft. A 1500 px PNG or an SVG is best."),
      h("div", { className: "ml-toasts ds-toast-demo" },
        h("div", { className: "ml-toast ml-toast--success", role: "status" },
          h("span", { className: "ml-toast__icon", "aria-hidden": true }, h(Check)),
          h("div", { className: "ml-toast__main" }, h("span", { className: "ml-toast__title" }, "Look applied to 6 pieces"), h("span", { className: "ml-toast__body" }, "Statement drop, Graffiti.")),
          h("div", { className: "ml-toast__side" }, h("button", { type: "button", className: "ml-toast__action" }, "Undo")))),
      h(Notice, { tone: "danger", title: "Couldn't send the order" }, "Your details are saved on this device. Try again in a minute.")));
}

function PhoneBar({ a }) {
  // the bar only shows once the hero's own CTAs have scrolled out of view
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const el = document.getElementById("ds-hero-ctas");
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting || e.boundingClientRect.top > 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return h("div", { className: "ml-sticky-bar ds-phonebar", "data-hidden": hidden },
    h("div", { className: "ml-sticky-bar__sum" }, h("strong", null, "$2,743"), h("span", null, `72 pieces · ${a.hero?.name || "Your look"}`)),
    h(Button, { variant: "team", iconRight: h(ArrowRight, { "aria-hidden": true }) }, "Review order"));
}

function Footer() {
  return h("footer", { className: "ml-footer" },
    h("div", { className: "container" },
      h("div", { className: "ml-footer__top" },
        h("div", { className: "ml-footer__brand" }, h(Wordmark, { size: "sm", href: null }), h("p", null, "Your logo, remixed into a full team drop.")),
        h("div", { className: "ml-footer__contact" },
          h("span", { className: "ml-footer__label" }, "Orders and questions"),
          h(CopyText, { text: "orders@mascotlab.example", mono: false, className: "ml-footer__email" }),
          h("span", null, "Mon–Fri, 8am–5pm CT"))),
      h("p", { className: "ml-footer__note" }, "Mockups are previews; colors and placement are confirmed on a printed proof before production. Prices are estimates until proof approval. Your logo stays in this browser. Nothing is uploaded until you send an order."),
      h("div", { className: "ml-footer__base" }, h("span", null, `© ${new Date().getFullYear()} Mascot Lab · Northgate Bulldogs is a fictional sample team.`),
        // ThemeSwitch re-applies the saved theme on mount, which would undo ?theme=
        theme ? h(Segmented, { label: "Color theme", size: "sm", value: theme, onChange: () => {}, options: [{ value: "auto", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }] }) : h(ThemeSwitch))));
}

function App() {
  const a = useAssets();
  return h("div", { className: "ml-app" },
    h(Header, { logo: a.logo }),
    h("main", { className: "ml-main" },
      h("div", { className: "ml-page" },
        h(Hero, { a }),
        h(LooksRail, { a }),
        h(Lookbook, { a }),
        h(Facts),
        h(StudioSection, { a }),
        h(OrderSection),
        h(States),
        h(PhoneBar, { a }))),
    h(Footer));
}

createRoot(document.getElementById("root")).render(h(App));
