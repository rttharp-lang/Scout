// Mascot Lab — UI kit harness: every shared component in every state, light/dark,
// with swappable team palettes. Plain JS (no JSX) so it runs as-is from harness/.
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight, Download, Heart, Layers, Palette, Shirt, Shuffle, SlidersHorizontal, Sparkles, Trash2, Upload, Wand2,
} from "lucide-react";

import "@fontsource/graduate/400";
import "../src/styles/fonts.css";
import "../src/styles/tokens.css";
import "../src/styles/global.css";

import {
  Button, IconButton, Field, Input, Textarea, Slider, Select, Toggle, Segmented, Chip, ChipRow, ColorField,
  NumberStepper, Modal, Sheet, ConfirmProvider, useConfirm, ToastProvider, useToast, SpecLabel, Swatch, Skeleton,
  CanvasImage, Tabs, TabPanel, Notice, Wordmark, StepNav, TeamChip,
} from "../src/ui/components/index.js";
import { teamCssVars } from "../src/state/store.jsx";
import { DEFAULT_SAMPLE, SAMPLE_LOGOS } from "../src/assets/samples/index.js";
import { prepareLogo } from "../src/engine/image.js";

const h = React.createElement;
const F = React.Fragment;
const params = new URLSearchParams(location.search);

const TEAMS = {
  northgate: { name: "Northgate Bulldogs", school: "Northgate", mascot: "Bulldogs", palette: DEFAULT_SAMPLE.palette },
  ember: { name: "Riverside Embers", school: "Riverside", mascot: "Embers", palette: { primary: "#C8102E", secondary: "#111111", accent: "#FFFFFF", dark: "#0B0D10", light: "#F4F5F7" } },
  forest: { name: "Lakeview Pines", school: "Lakeview", mascot: "Pines", palette: { primary: "#0F5132", secondary: "#E8E3D3", accent: "#C9A227", dark: "#0B1410", light: "#F5F3EC" } },
  lemon: { name: "Sunnyside Bees", school: "Sunnyside", mascot: "Bees", palette: { primary: "#FFD100", secondary: "#FFFFFF", accent: "#F2F2F2", dark: "#1A1A1A", light: "#FFFBEA" } },
};

function applyTeam(id) {
  const t = TEAMS[id] || TEAMS.northgate;
  for (const [k, v] of Object.entries(teamCssVars(t.palette))) document.documentElement.style.setProperty(k, v);
}
function applyTheme(mode) {
  if (mode === "light" || mode === "dark") document.documentElement.setAttribute("data-theme", mode);
  else document.documentElement.removeAttribute("data-theme");
}

/* ───────────── layout helpers ───────────── */
const css = `
  .kit { max-width: 1320px; margin: 0 auto; padding: 0 var(--gutter) 96px; }
  .kit-top { position: sticky; top: 0; z-index: 50; background: var(--glass); -webkit-backdrop-filter: saturate(1.8) blur(20px); backdrop-filter: saturate(1.8) blur(20px); box-shadow: var(--shadow-header); }
  .kit-top__in { max-width: 1320px; margin: 0 auto; padding: 12px var(--gutter); display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; }
  .kit-top__title { display: flex; align-items: center; gap: 12px; margin-right: auto; }
  .kit-sec { padding-top: 64px; display: grid; gap: 24px; }
  .kit-sec__head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
  .kit-sec__head h2 { font-size: var(--text-3xl); }
  .kit-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); align-items: start; }
  .kit-card { background: var(--page); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: 20px; display: grid; gap: 16px; align-content: start; min-width: 0; }
  .kit-card--wide { grid-column: 1 / -1; overflow-x: auto; }
  .kit-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .kit-tokens { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  .kit-token { display: grid; gap: 6px; }
  .kit-token i { display: block; height: 48px; border-radius: var(--radius-md); box-shadow: inset 0 0 0 1px var(--line); }
  .kit-stack { display: grid; gap: 16px; }
  .kit-type > * + * { margin-top: 12px; }
  .kit-canvases { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  .kit-canvases figure { display: grid; gap: 6px; margin: 0; }
  .kit-dialog-preview { position: relative; display: grid; place-items: center; padding: 28px; border-radius: var(--radius-lg); background: var(--scrim); }
  .kit-dialog-preview .ml-dialog { animation: none; }
`;
function Section({ title, code, children }) {
  return h("section", { className: "kit-sec" },
    h("div", { className: "kit-sec__head" }, h("h2", null, title), code && h(SpecLabel, { wrap: true }, code)),
    children);
}
function Card({ title, wide, children }) {
  return h("div", { className: "kit-card" + (wide ? " kit-card--wide" : "") },
    title && h(SpecLabel, { variant: "plain" }, title), children);
}
const Row = (...children) => h("div", { className: "kit-row" }, ...children);

/* ───────────── gallery ───────────── */
function Gallery({ logo }) {
  const [theme, setTheme] = useState(params.get("theme") || "auto");
  const [team, setTeam] = useState(params.get("team") || "northgate");
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => applyTeam(team), [team]);
  const T = TEAMS[team] || TEAMS.northgate;

  return h(F, null,
    h("style", null, css),
    h("header", { className: "kit-top" },
      h("div", { className: "kit-top__in" },
        h("div", { className: "kit-top__title" }, h(Wordmark, { href: null }), h(SpecLabel, { variant: "box" }, "UI kit · harness")),
        h(Segmented, { label: "Team palette", size: "sm", value: team, onChange: setTeam,
          options: Object.entries(TEAMS).map(([id, t]) => ({ value: id, label: t.school, icon: h("span", { style: { width: 10, height: 10, borderRadius: "50%", background: t.palette.primary, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / .2)" } }) })) }),
        h(Segmented, { label: "Theme", size: "sm", value: theme, onChange: setTheme,
          options: [{ value: "auto", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }] }),
      )),
    h("main", { className: "kit" },
      h(TypeSection), h(TokenSection), h(ButtonSection), h(FormSection, { palette: T.palette }), h(ChoiceSection),
      h(LabelSection, { palette: T.palette }), h(MediaSection, { logo }), h(NavSection, { logo, team: T }), h(OverlaySection)),
  );
}

function TypeSection() {
  return h(Section, { title: "Type", code: "Geist · Archivo Wide · Geist Mono · Graduate" },
    h("div", { className: "kit-grid" },
      h(Card, { title: "Wide display (statements only)" },
        h("div", { className: "kit-type" },
          h("p", { className: "t-hero", style: { fontSize: "clamp(40px, 5vw, 72px)" } }, "Every look."),
          h("p", { className: "t-display", style: { fontSize: 44 } }, "The whole kit"),
          h("p", { className: "t-display-sm" }, "12 pcs"))),
      h(Card, { title: "Titles (Geist, sentence case)" },
        h("div", { className: "kit-type" },
          h("h1", null, "Remix your logo"),
          h("h2", null, "The collection"),
          h("p", { className: "t-title-3" }, "Warm-up hoodie"),
          h("p", { className: "t-headline" }, "Order summary"),
          h("p", { className: "t-subhead" }, "Estimated total"))),
      h(Card, { title: "Running text + metadata" },
        h("div", { className: "kit-type" },
          h("p", { className: "t-eyebrow" }, "Step 2 of 3"),
          h("p", { className: "t-lead" }, "Upload your team logo, run it through print-shop effects, and order the whole kit."),
          h("p", null, "Body copy in Geist. Mockups are previews; colors are confirmed on a printed proof before production."),
          h("p", { className: "t-caption muted" }, "Caption and hint text for helper lines."),
          h("p", { className: "t-meta" }, "ML-J01 · #13294B · YS–3XL"))),
      h(Card, { title: "Jersey lettering (Graduate)" },
        h("div", { style: { display: "grid", placeItems: "center", padding: "18px 0", background: "var(--team-1)", borderRadius: "var(--radius-lg)", color: "var(--team-2)" } },
          h("div", { className: "jersey-type", style: { fontSize: 28, letterSpacing: "0.06em", WebkitTextStroke: "1px var(--team-3)" } }, "Washington"),
          h("div", { className: "jersey-type", style: { fontSize: 96, lineHeight: 1, WebkitTextStroke: "2px var(--team-3)" } }, "44"))),
    ));
}

const TOKENS = [
  ["--page", "page"], ["--tile", "tile"], ["--tile-hover", "tile-hover"], ["--tile-strong", "tile-strong"], ["--raised", "raised"], ["--field", "field"],
  ["--ink", "ink"], ["--ink-2", "ink-2"], ["--ink-3", "ink-3"], ["--ink-fill", "ink-fill"], ["--line", "line (hairline)"], ["--line-strong", "line-strong"],
  ["--focus", "focus"], ["--success", "success"], ["--warning", "warning"], ["--danger", "danger"],
  ["--team-1", "team-1"], ["--team-2", "team-2"], ["--team-3", "team-3"], ["--accent", "accent (readable team)"],
  ["--stage-paper", "stage paper"], ["--stage-mid", "stage mid"], ["--stage-dark", "stage dark"], ["--stage-product", "stage product"],
];
function TokenSection() {
  return h(Section, { title: "Color", code: "tokens.css" },
    h("div", { className: "kit-card" },
      h("div", { className: "kit-tokens" }, TOKENS.map(([v, name]) =>
        h("div", { key: v, className: "kit-token" }, h("i", { style: { background: `var(${v})` } }), h(SpecLabel, null, name))))));
}

function ButtonSection() {
  const variants = ["primary", "team", "secondary", "outline", "ghost", "danger"];
  return h(Section, { title: "Buttons", code: "Button · IconButton" },
    h("div", { className: "kit-grid" },
      h(Card, { title: "Variants · md", wide: true },
        Row(...variants.map((v) => h(Button, { key: v, variant: v, icon: v === "danger" ? h(Trash2) : undefined }, v === "team" ? "Team" : v[0].toUpperCase() + v.slice(1))))),
      h(Card, { title: "Sizes" },
        Row(h(Button, { size: "sm" }, "Small"), h(Button, null, "Medium"), h(Button, { size: "lg", iconRight: h(ArrowRight) }, "Large"))),
      h(Card, { title: "Icon + states" },
        Row(h(Button, { icon: h(Upload) }, "Upload logo"), h(Button, { variant: "secondary", icon: h(Download) }, "Download")),
        Row(h(Button, { loading: true }, "Rendering"), h(Button, { variant: "secondary", loading: true }, "Saving"), h(Button, { disabled: true }, "Disabled"))),
      h(Card, { title: "Block + link" },
        h(Button, { block: true, size: "lg", href: "#collection", iconRight: h(ArrowRight) }, "Next: Collection"),
        h(Button, { block: true, variant: "secondary", href: "#studio" }, "Back to remix")),
      h(Card, { title: "IconButton" },
        Row(
          h(IconButton, { label: "Shuffle seed", icon: h(Shuffle) }),
          h(IconButton, { label: "Adjust", icon: h(SlidersHorizontal), variant: "secondary" }),
          h(IconButton, { label: "Magic", icon: h(Wand2), variant: "primary" }),
          h(IconButton, { label: "Outline", icon: h(Palette), variant: "outline" }),
          h(IconButton, { label: "Favorite", icon: h(Heart), pressed: true }),
          h(IconButton, { label: "Favorite", icon: h(Heart), pressed: false, variant: "secondary" }),
          h(IconButton, { label: "Small", icon: h(Layers), size: "sm" }),
          h(IconButton, { label: "Large", icon: h(Shirt), size: "lg", variant: "secondary" }),
          h(IconButton, { label: "Disabled", icon: h(Trash2), disabled: true }))),
    ));
}

function FormSection({ palette }) {
  const [a, setA] = useState(42);
  const [b, setB] = useState(1.5);
  const [c, setC] = useState(-12);
  const [sel, setSel] = useState("screen");
  const [qty, setQty] = useState(12);
  const [qty0, setQty0] = useState(0);
  const [ink, setInk] = useState("secondary");
  const [ink2, setInk2] = useState("#E4572E");
  return h(Section, { title: "Inputs", code: "Field · Slider · Select · Stepper · ColorField" },
    h("div", { className: "kit-grid" },
      h(Card, { title: "Field + Input" },
        h(Field, { label: "School name", hint: "As it should appear on the order sheet." }, h(Input, { defaultValue: "Northgate High School" })),
        h(Field, { label: "Coach email", required: true, error: "Enter an email so we can send the proof." }, h(Input, { type: "email", defaultValue: "coach@" })),
        h(Field, { label: "Phone", optional: true }, h(Input, { type: "tel", placeholder: "(555) 010-2030" })),
        h(Field, { label: "Style code" }, h(Input, { mono: true, defaultValue: "ML-H03", disabled: true }))),
      h(Card, { title: "Textarea + Select" },
        h(Field, { label: "Notes for the print shop", optional: true }, h(Textarea, { rows: 3, placeholder: "Anything we should know — rush dates, sponsor logos…" })),
        h(Select, { label: "Print method", value: sel, onChange: setSel, hint: "Shown on the spec sheet.",
          options: [{ value: "screen", label: "Screen print" }, { value: "sub", label: "Sublimation" }, { value: "emb", label: "Embroidery" }, { value: "chenille", label: "Chenille patch" }] }),
        h(Select, { label: "Disabled", value: "a", options: [{ value: "a", label: "Not available" }], disabled: true })),
      h(Card, { title: "Slider" },
        h(Slider, { label: "Dot size", value: a, min: 4, max: 80, unit: "px", onChange: setA }),
        h(Slider, { label: "Outline", value: b, min: 0, max: 6, step: 0.5, unit: "px", onChange: setB, showScale: true }),
        h(Slider, { label: "Angle", value: c, min: -45, max: 45, unit: "°", onChange: setC, hint: "Screen angle of the dot grid." }),
        h(Slider, { label: "Disabled", value: 30, min: 0, max: 100, unit: "%", disabled: true })),
      h(Card, { title: "Checkbox · radio · stepper" },
        h("label", { className: "kit-row small" }, h("input", { type: "checkbox", defaultChecked: true }), "Remove background"),
        h("label", { className: "kit-row small" }, h("input", { type: "checkbox" }), "Add player names"),
        h("label", { className: "kit-row small" }, h("input", { type: "checkbox", disabled: true }), "Disabled option"),
        h("div", { className: "kit-row small", role: "radiogroup", "aria-label": "Fit" },
          h("label", { className: "kit-row" }, h("input", { type: "radio", name: "fit", defaultChecked: true }), "Adult"),
          h("label", { className: "kit-row" }, h("input", { type: "radio", name: "fit" }), "Youth")),
        Row(h(NumberStepper, { label: "Hoodies, size M", value: qty, onChange: setQty }), h(NumberStepper, { label: "Hoodies, size XL", value: qty0, onChange: setQty0, size: "sm" }), h(NumberStepper, { label: "Disabled", value: 3, disabled: true }))),
      h(Card, { title: "ColorField" },
        h(ColorField, { label: "Ink color", value: ink, onChange: setInk, palette }),
        h(ColorField, { label: "Glow color", value: ink2, onChange: setInk2, palette, extra: ["#FFFFFF", "#0B0D10"], hint: "Custom colors print as a spot ink." })),
    ));
}

function ChoiceSection() {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [seg, setSeg] = useState("front");
  const [seg2, setSeg2] = useState("statement");
  const [seg3, setSeg3] = useState("adult");
  const [chips, setChips] = useState({ print: true, street: false, metal: false, retro: true, digital: false });
  const [fav, setFav] = useState(true);
  return h(Section, { title: "Choices", code: "Toggle · Segmented · Chip" },
    h("div", { className: "kit-grid" },
      h(Card, { title: "Toggle" },
        h(Toggle, { checked: on, onChange: setOn, label: "Remove background" }),
        h(Toggle, { checked: off, onChange: setOff, label: "Show print area" }),
        h(Toggle, { checked: true, disabled: true, label: "Disabled (on)" }),
        h("hr"),
        h(Toggle, { block: true, checked: on, onChange: setOn, label: "Player names on back", description: "Adds each roster name above the number." })),
      h(Card, { title: "Segmented" },
        h(Segmented, { label: "View", value: seg, onChange: setSeg, options: [{ value: "front", label: "Front" }, { value: "back", label: "Back" }] }),
        h(Segmented, { label: "Drop style", value: seg2, onChange: setSeg2, block: true, options: [{ value: "statement", label: "Statement" }, { value: "classic", label: "Classic" }, { value: "allover", label: "All-over" }, { value: "tonal", label: "Tonal" }] }),
        h(Segmented, { label: "Fit", value: seg3, onChange: setSeg3, size: "sm", options: [{ value: "adult", label: "Adult" }, { value: "youth", label: "Youth" }, { value: "na", label: "Women's", disabled: true }] })),
      h(Card, { title: "Chip (filter)" },
        h(ChipRow, { label: "Categories" },
          Object.entries({ print: "Print shop", street: "Street", metal: "Chrome & light", retro: "Varsity & craft", digital: "Digital" }).map(([k, l], i) =>
            h(Chip, { key: k, selected: chips[k], count: [6, 4, 3, 5, 4][i], onClick: () => setChips({ ...chips, [k]: !chips[k] }) }, l))),
        h(ChipRow, { label: "More" },
          h(Chip, { size: "sm", selected: fav, icon: h(Heart), onClick: () => setFav(!fav) }, "Favorites"),
          h(Chip, { size: "sm" }, "Small"),
          h(Chip, { disabled: true }, "Disabled"))),
    ));
}

function LabelSection({ palette }) {
  const [pick, setPick] = useState("secondary");
  return h(Section, { title: "Meta labels & swatches", code: "SpecLabel · Swatch · Notice" },
    h("div", { className: "kit-grid" },
      h(Card, { title: "SpecLabel" },
        Row(h(SpecLabel, null, "Screen print"), h(SpecLabel, { k: "Style", v: "ML-H03" }), h(SpecLabel, { mono: true }, "ML-J01 · #13294B")),
        Row(h(SpecLabel, { variant: "box" }, "Most ordered"), h(SpecLabel, { variant: "solid", k: "Size", v: "2XL" }), h(SpecLabel, { variant: "team" }, "Your look"), h(SpecLabel, { variant: "warning" }, "Sample"), h(SpecLabel, { variant: "success" }, "Sent")),
        Row(h(SpecLabel, { size: "lg" }, "Step 2 of 3 · Collection"))),
      h(Card, { title: "Swatch" },
        Row(...Object.entries(palette).map(([k, v]) => h(Swatch, { key: k, color: v, size: "sm", shape: "round", label: k }))),
        Row(h(Swatch, { color: palette.primary, name: "Navy", showHex: true, size: "lg" }), h(Swatch, { color: palette.secondary, name: "Athletic gold", showHex: true, size: "lg" })),
        Row(...["primary", "secondary", "accent", "dark"].map((k) => h(Swatch, { key: k, color: palette[k], selected: pick === k, onClick: () => setPick(k), label: k }))),
        Row(h(Swatch, { color: "#FFFFFF", size: "xl", name: "White", showHex: true }), h(Swatch, { color: palette.primary, size: "xs", name: "Body", showHex: true }))),
      h(Card, { title: "Notice" },
        h(Notice, { title: "Sample logo loaded" }, "Upload your own logo any time — your effect and colors carry over."),
        h(Notice, { tone: "warning", title: "Upload your logo again", onDismiss: () => {} }, "It was too large to keep on this device."),
        h(Notice, { tone: "success" }, "Order request sent. Reference ML-4F2K9."),
        h(Notice, { tone: "danger", title: "Couldn't read that file" }, "Try a PNG, JPG, SVG or WebP under 15 MB.")),
    ));
}

function MediaSection({ logo }) {
  const [tab, setTab] = useState("effects");
  return h(Section, { title: "Media & loading", code: "CanvasImage · Skeleton · Tabs" },
    h("div", { className: "kit-grid" },
      h(Card, { title: "CanvasImage · stages", wide: true },
        h("div", { className: "kit-canvases" },
          ...["paper", "dark", "mid", "team", "checker", "tile"].map((st) =>
            h("figure", { key: st }, h(CanvasImage, { canvas: logo, stage: st, ratio: 1, padding: 0.12, alt: `Sample logo on ${st}` }), h(SpecLabel, null, st))),
          h("figure", null, h(CanvasImage, { canvas: logo, stage: "paper", ratio: 1, padding: 0.12, loading: true, alt: "Rendering" }), h(SpecLabel, null, "loading (stale)")),
          h("figure", null, h(CanvasImage, { canvas: null, ratio: 1, alt: "Not ready" }), h(SpecLabel, null, "no canvas → skeleton")),
          h("figure", null, h(CanvasImage, { canvas: logo, ratio: 1, error: "Chrome failed to render", alt: "Error" }), h(SpecLabel, null, "error")),
          h("figure", null, h(CanvasImage, { canvas: logo, stage: "paper", ratio: 4 / 3, fit: "cover", alt: "Cover crop" }), h(SpecLabel, null, "cover 4:3")))),
      h(Card, { title: "Skeleton" },
        h(Skeleton, { variant: "square" }),
        h(Skeleton, { variant: "text", lines: 3 })),
      h(Card, { title: "Tabs" },
        h(Tabs, { idBase: "kit", label: "Studio panels", value: tab, onChange: setTab, tabs: [{ id: "effects", label: "Effects", count: 22 }, { id: "adjust", label: "Adjust" }, { id: "colors", label: "Colors", count: 5 }, { id: "off", label: "Export", disabled: true }] }),
        h(TabPanel, { idBase: "kit", value: tab }, h("p", { className: "small muted", style: { paddingTop: 8 } }, `Panel: ${tab}`)),
        h(Tabs, { idBase: "kit2", size: "sm", label: "Views", value: "front", tabs: [{ id: "front", label: "Front" }, { id: "back", label: "Back" }] })),
    ));
}

function NavSection({ logo, team }) {
  return h(Section, { title: "Brand & navigation", code: "Wordmark · StepNav · TeamChip" },
    h("div", { className: "kit-grid" },
      h(Card, { title: "Wordmark", wide: true },
        h(Wordmark, { size: "xl", href: null }), Row(h(Wordmark, { size: "lg", href: null }), h(Wordmark, { href: null }), h(Wordmark, { size: "sm", href: null }))),
      h(Card, { title: "StepNav · full", wide: true },
        ...[0, 1, 2, 3, 4].map((n) => h("div", { key: n, className: "kit-row" }, h(SpecLabel, { style: { width: 70 } }, `current=${n}`), h(StepNav, { current: n })))),
      h(Card, { title: "StepNav · compact" },
        ...[0, 1, 2, 3, 4].map((n) => h("div", { key: n, className: "kit-row", style: { justifyContent: "space-between" } }, h(SpecLabel, null, `current=${n}`), h(StepNav, { current: n, variant: "compact" })))),
      h(Card, { title: "TeamChip" },
        h(TeamChip, { team: { school: team.school, mascot: team.mascot, isSample: true }, palette: team.palette, logoCanvas: logo, href: "#studio", title: "Edit team" }),
        h(TeamChip, { team: { school: "Saint Bartholomew's Academy", mascot: "Fighting Crusaders", isSample: false }, palette: team.palette, logoCanvas: logo }),
        h(TeamChip, { team: { school: team.school, mascot: team.mascot }, palette: team.palette, logoSrc: SAMPLE_LOGOS[2]?.url, compact: true })),
    ));
}

function OverlaySection() {
  const [modal, setModal] = useState(params.get("open") === "modal");
  const [sheet, setSheet] = useState(params.get("open") === "sheet");
  const confirm = useConfirm();
  const { toast } = useToast();
  const [answer, setAnswer] = useState("—");
  const ask = async () => setAnswer((await confirm({ kicker: "Roster", title: "Clear example players?", body: "The 12 example rows will be removed. You can add your players by typing or pasting a list.", confirmLabel: "Clear examples", cancelLabel: "Keep them", tone: "danger" })) ? "confirmed" : "cancelled");
  const toasts = () => {
    toast({ tone: "success", title: "Order request sent", body: "Reference ML-4F2K9 — we'll email the proof." });
    toast({ tone: "warning", title: "Logo is low resolution", body: "Large prints may look soft. A 1500px+ PNG or SVG is best.", action: { label: "Upload", onClick: () => {} } });
    toast({ tone: "danger", title: "Couldn't save the file", body: "Download cancelled.", duration: 0 });
    toast({ title: "Effect applied to 6 pieces" });
  };
  useEffect(() => {
    if (params.get("open") === "confirm") ask();
    if (params.get("open") === "toasts") toasts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return h(Section, { title: "Overlays", code: "Modal · Sheet · useConfirm · useToast" },
    h("div", { className: "kit-grid" },
      h(Card, { title: "Open" },
        Row(h(Button, { onClick: () => setModal(true) }, "Modal"), h(Button, { variant: "secondary", onClick: () => setSheet(true) }, "Sheet")),
        Row(h(Button, { variant: "danger", onClick: ask }, "Confirm…"), h(SpecLabel, { k: "Answer", v: answer })),
        Row(h(Button, { variant: "secondary", icon: h(Sparkles), onClick: toasts }, "Toasts"))),
      h(Card, { title: "Dialog (static preview)", wide: false },
        h("div", { className: "kit-dialog-preview" },
          h("div", { className: "ml-dialog ml-dialog--sm", role: "presentation" },
            h("div", { className: "ml-dialog__head" }, h("div", { className: "ml-dialog__titles" }, h(SpecLabel, null, "Studio"), h("div", { className: "ml-dialog__title" }, "Reset this effect?"))),
            h("div", { className: "ml-dialog__body" }, h("p", null, "Sliders go back to the Comic preset. Your logo and colors stay.")),
            h("div", { className: "ml-dialog__foot" }, h(Button, { variant: "secondary", size: "sm" }, "Cancel"), h(Button, { size: "sm" }, "Reset"))))),
    ),
    h(Modal, {
      open: modal, onClose: () => setModal(false), kicker: "Team", title: "Edit team details",
      footer: h(F, null, h(Button, { variant: "secondary", onClick: () => setModal(false) }, "Cancel"), h(Button, { onClick: () => setModal(false) }, "Save team")),
    },
      h("div", { className: "kit-stack" },
        h(Field, { label: "School" }, h(Input, { defaultValue: "Northgate", "data-autofocus": true })),
        h(Field, { label: "Mascot" }, h(Input, { defaultValue: "Bulldogs" })),
        h(Toggle, { block: true, checked: true, onChange: () => {}, label: "Use logo colors", description: "Pull the palette from your logo." }))),
    h(Sheet, {
      open: sheet, onClose: () => setSheet(false), kicker: "Hoodie · ML-H03", title: "Adjust placement",
      footer: h(F, null, h(Button, { variant: "ghost", onClick: () => setSheet(false) }, "Reset"), h(Button, { onClick: () => setSheet(false) }, "Done")),
    },
      h("div", { className: "kit-stack" },
        h(Segmented, { label: "View", value: "front", block: true, options: [{ value: "front", label: "Front" }, { value: "back", label: "Back" }] }),
        h(Slider, { label: "Scale", value: 108, min: 50, max: 150, unit: "%" }),
        h(Slider, { label: "Rotate", value: -8, min: -45, max: 45, unit: "°" }),
        h(ColorField, { label: "Base color", value: "dark", palette: TEAMS.northgate.palette }))),
  );
}

/* ───────────── boot ───────────── */
applyTheme(params.get("theme") || "auto");
applyTeam(params.get("team") || "northgate");

function App() {
  const [logo, setLogo] = useState(null);
  useEffect(() => {
    prepareLogo(DEFAULT_SAMPLE.url).then((r) => setLogo(r.canvas)).catch((e) => console.error("[ui harness] logo failed", e));
  }, []);
  useEffect(() => {
    if (!logo) return;
    (document.fonts?.ready || Promise.resolve()).then(() => setTimeout(() => { window.__READY = true; }, 150));
  }, [logo]);
  return h(ToastProvider, null, h(ConfirmProvider, null, h(Gallery, { logo })));
}

createRoot(document.getElementById("root")).render(h(App));
