// Mascot Lab — Studio inspector for the selected look (DESIGN.md §4.7, the "Tune every
// look" blueprint in harness/design.html): a large live preview on its studio tile with
// glass controls over it (shuffle top-right, Artwork / On product bottom-left, backdrop
// swatches bottom-right), the look's name and print method, presets as pills, the
// effect's own controls (from its ParamSpec) with Reset, then Download PNG and the
// page's one forward action, "Use this look".
import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Download, Heart, Shuffle } from "lucide-react";
import {
  Button, CanvasImage, Chip, ChipRow, ColorField, IconButton, Segmented, Select, Skeleton, Slider, Spinner, Toggle, cx,
  inkFor, navigate,
} from "../components/index.js";
import { canvasToBlob, defaultParams, renderEffect, resolveParams } from "../../engine/render.js";
import { luminance } from "../../engine/core.js";
import { saveFile } from "../../platform/files.js";
import { teamLabel } from "../../order/team.js";
import { CANT_SAVE_BODY, CANT_SAVE_TITLE, cantSaveHere, saveError } from "../pages/saveNotice.js";
import { catLabel, stageStyle } from "./Gallery.jsx";
import { holdProps, isAbort, renderKey, scheduler, useDraftRender, useEffectRender, useHeld } from "./renderKit.js";

export const INSPECTOR_SIZE = 1024;
const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const DEFAULT_SEED = 7;

/**
 * useInspectorRender(effect, state, logo) → the 1024 "final" render, with stand-ins
 * while it renders, best first: the 384 gallery tile of the same settings (it lands
 * first: smaller, higher priority), then the newest 256 px draft from a slider drag,
 * then the last 1024 of this effect. While a slider is held the big render waits and
 * drafts keep the preview moving; the big one runs after a pause in the tuning.
 */
export function useInspectorRender(effect, state, logo) {
  const { params, seed } = state.effect;
  const held = useHeld();
  const placeholderKey = effect && logo?.key
    ? renderKey({ effectId: effect.id, logoKey: logo.key, palette: state.palette, params, seed, size: 384, quality: "preview" })
    : null;
  const main = useEffectRender({
    effect, logo, params, palette: state.palette, seed,
    size: INSPECTOR_SIZE, quality: "final", priority: 20, debounce: 380, placeholderKey, enabled: !held,
  });
  const draft = useDraftRender({ effect, logo, params, palette: state.palette, seed, active: held && !!effect });
  // a fresh big render retires the drafts
  const { clear } = draft;
  useEffect(() => { if (main.fresh) clear(); }, [main.fresh, clear]);
  if (draft.canvas && !main.fresh && !main.placeholder && main.status !== "error") {
    return { ...main, canvas: draft.canvas, placeholder: true, draft: true };
  }
  return main;
}

/** Is the current look exactly this preset? (compares fully resolved params) */
function presetMatches(effect, preset, params, palette) {
  const a = resolveParams(effect, params, palette);
  const b = resolveParams(effect, preset.params, palette);
  return Object.keys(a).every((k) => a[k] === b[k]);
}

const isDirty = (state) => Object.keys(state.effect.params || {}).length > 0 || state.effect.seed !== DEFAULT_SEED;

function nextSeed(seed) {
  const x = Math.imul((seed >>> 0) ^ 0x9e3779b9, 2654435761) >>> 0;
  return (x % 99991) + 8;
}

/* ───────────────────────────── head ───────────────────────────── */

export function InspectorHead({ effect, favorite = false, onToggleFavorite, compact = false }) {
  if (!effect) return <div className="st-insp__head"><Skeleton variant="text" lines={3} /></div>;
  if (compact) {
    return effect.blurb ? <div className="st-insp__head is-compact"><p className="st-insp__blurb">{effect.blurb}</p></div> : null;
  }
  return (
    <div className="st-insp__head">
      <div className="st-insp__titlerow">
        <h2 className="t-title-3 st-insp__title">{effect.name}</h2>
        {onToggleFavorite && (
          <IconButton
            size="sm"
            className={cx("st-favbtn", favorite && "is-on")}
            pressed={favorite}
            label={favorite ? `Remove ${effect.name} from favorites` : `Add ${effect.name} to favorites`}
            title={favorite ? "Remove from favorites" : "Add to favorites"}
            icon={<Heart aria-hidden="true" />}
            onClick={() => onToggleFavorite(effect.id)}
          />
        )}
      </div>
      <p className="st-insp__meta">{catLabel(effect.category)} · {effect.method}</p>
      {effect.blurb && <p className="st-insp__blurb">{effect.blurb}</p>}
    </div>
  );
}

/* ───────────────────────────── stage ───────────────────────────── */

const VIEWS = [
  { value: "art", label: "Artwork", title: "The graphic on its own" },
  { value: "product", label: "On product", title: "The graphic printed on a piece from your collection" },
];

/** The team color for the "team color" backdrop: the first of primary, dark, secondary
 * that differs clearly from the effect's own stage (so the swatches differ). */
const STAGE_HEX = { paper: "#F1F1EE", dark: "#121316", mid: "#8A8F98" };
const ROLE_LABEL = { primary: "Team primary", dark: "Team dark", secondary: "Team secondary" };
function teamBackdrop(stage, palette) {
  const stageHex = stage === "team" ? palette.primary : STAGE_HEX[stage] || STAGE_HEX.paper;
  const rgb = (h) => { const n = parseInt(String(h).slice(1, 7), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const far = (a, b) => { const x = rgb(a), y = rgb(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) > 90; };
  for (const role of ["primary", "dark", "secondary"]) {
    if (palette[role] && far(palette[role], stageHex)) return { hex: palette[role], name: ROLE_LABEL[role] };
  }
  return { hex: palette.primary, name: ROLE_LABEL.primary };
}
const darkHex = (hex) => { try { return luminance(hex) < 0.28; } catch { return false; } };

/** Backdrop picker: three round swatches (the look's studio stage, a team color, transparent). */
function BackdropPicker({ value, onChange, effect, palette }) {
  const stage = effect?.stage || "paper";
  const team = teamBackdrop(stage, palette);
  const opts = [
    { value: "stage", name: "Studio backdrop", cls: `ml-stage--${stage}`, style: stageStyle(stage, palette), ink: stage === "paper" ? "#0B0D10" : stage === "team" ? inkFor(palette.primary) : "#FFFFFF" },
    { value: "garment", name: `${team.name} backdrop`, cls: "", style: { background: team.hex }, ink: inkFor(team.hex) },
    { value: "checker", name: "Transparent, as the PNG downloads", cls: "ml-stage--checker", style: null, ink: "#0B0D10" },
  ];
  const options = opts.map((o) => ({
    value: o.value,
    title: o.name,
    label: null,
    icon: (
      <>
        <span className={cx("st-bd__sw", o.cls)} style={{ ...(o.style || {}), "--sw-ink": o.ink }} aria-hidden="true">
          {value === o.value && <Check />}
        </span>
        <span className="sr-only">{o.name}</span>
      </>
    ),
  }));
  return <Segmented size="sm" label="Preview backdrop" className="st-bd st-glass" options={options} value={value} onChange={onChange} />;
}

/**
 * InspectorStage — the big preview tile. view "art": the render on the chosen backdrop;
 * view "product": the render printed on one piece of the collection (mock from
 * useProductMockup). Controls sit in the tile's corners, over the backdrop.
 */
export function InspectorStage({ effect, render, state, actions, backdrop, onBackdrop, view = "art", onView, mock }) {
  const product = view === "product" && !!mock?.available;
  const team = teamBackdrop(effect?.stage || "paper", state.palette);
  let tileCls, style = null, onDark;
  if (!effect) { tileCls = ""; onDark = false; }
  else if (product) { tileCls = "ml-tile--product"; onDark = false; }
  else if (backdrop === "checker") { tileCls = "ml-stage--checker"; onDark = false; }
  else if (backdrop === "garment") { tileCls = ""; style = { background: team.hex }; onDark = darkHex(team.hex); }
  else {
    tileCls = `ml-tile--${effect.stage}`;
    style = stageStyle(effect.stage, state.palette);
    onDark = effect.stage === "dark" || effect.stage === "mid" || (effect.stage === "team" && darkHex(state.palette.primary));
  }
  const rendering = render.status === "pending" || (!render.fresh && render.status !== "error");
  const shown = product ? mock.canvas : render.canvas;
  const busy = product ? (render.status !== "error" && (rendering || mock.pending)) : rendering;
  const busyLabel = product ? "Printing" : render.draft ? "Draft" : render.placeholder ? "Sharpening" : "Rendering";
  const caption = product && mock.garmentName ? `${mock.garmentName} · ${mock.view === "back" ? "Back" : "Front"}` : null;
  return (
    <div className="st-insp__stagewrap">
      <div
        className={cx("ml-tile ml-tile--hero st-stage", tileCls, product && "is-product", onDark ? "is-ondark" : "is-onlight")}
        style={style || undefined}
        aria-busy={busy || undefined}
      >
        {render.status === "error" ? (
          <div className="st-insp__error" role="alert">
            <p className="st-insp__error-title">Render failed</p>
            <p>{effect?.name || "This look"} couldn't draw your logo with these settings.</p>
            <Button size="sm" variant="secondary" onClick={render.retry}>Try again</Button>
          </div>
        ) : (
          <div className="ml-tile__media">
            <CanvasImage
              canvas={shown}
              ratio={1}
              className="st-insp__canvas"
              alt={!effect ? "Loading preview" : product ? `${effect.name} printed on the ${mock.garmentName || "garment"}, ${mock.view || "front"}` : `Your logo in ${effect.name}`}
            />
          </div>
        )}
        {(caption || (busy && effect)) && (
          <div className="st-stage__tl">
            {caption && <span className="st-pill st-glass">{caption}</span>}
            {busy && effect && <span className="st-pill st-glass st-insp__busy" aria-hidden="true"><Spinner /> {busyLabel}</span>}
          </div>
        )}
        {effect && actions && !product && (
          <div className="st-stage__tr">
            <IconButton
              variant="glass"
              className="st-glass"
              label="Shuffle"
              title="Shuffle: same settings, a new random variation"
              icon={<Shuffle aria-hidden="true" />}
              onClick={() => actions.setEffectSeed(nextSeed(state.effect.seed))}
            />
          </div>
        )}
        <div className="st-stage__bar">
          {mock?.available && onView ? (
            <Segmented size="sm" label="Preview" className="st-views st-glass" options={VIEWS} value={product ? "product" : "art"} onChange={onView} />
          ) : <span />}
          {!product && effect && (
            <BackdropPicker value={backdrop} onChange={onBackdrop} effect={effect} palette={state.palette} />
          )}
          {product && mock.drop && <span className="st-pill st-glass st-stage__drop">{mock.drop.name} drop</span>}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── controls ───────────────────────────── */

export function InspectorControls({ effect, state, actions }) {
  if (!effect) {
    return (
      <div className="st-insp__controls">
        <Skeleton variant="text" lines={3} />
      </div>
    );
  }
  const { params } = state.effect;
  const defaults = defaultParams(effect);
  const value = (spec) => (params[spec.key] !== undefined ? params[spec.key] : defaults[spec.key]);
  const resolved = resolveParams(effect, params, state.palette);
  const set = (key, v) => actions.setEffectParams({ [key]: v });
  const presets = effect.presets || [];
  const dirty = isDirty(state);
  const activePreset = presets.find((pr) => presetMatches(effect, pr, params, state.palette));

  return (
    <div className="st-insp__controls" {...holdProps}>
      {presets.length > 1 && (
        <div className="st-group">
          <div className="ml-panel__head"><span className="ml-panel__title" id="st-presets-h">Presets</span></div>
          <ChipRow aria-labelledby="st-presets-h" className="st-presets">
            {presets.map((pr) => (
              <Chip
                key={pr.name}
                selected={activePreset === pr}
                onClick={() => { actions.setEffectParams(null); actions.setEffectParams({ ...pr.params }); }}
              >
                {pr.name}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}

      {effect.params.length > 0 && (
        <div className="st-group st-params">
          <div className="ml-panel__head">
            <span className="ml-panel__title">Adjust</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!dirty}
              onClick={() => { actions.setEffectParams(null); actions.setEffectSeed(DEFAULT_SEED); }}
              title="Back to the default look"
            >
              Reset
            </Button>
          </div>
          {effect.params.map((spec) => (
            <ParamControl key={spec.key} spec={spec} value={value(spec)} resolved={resolved[spec.key]} palette={state.palette} onChange={(v) => set(spec.key, v)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ParamControl({ spec, value, resolved, palette, onChange }) {
  switch (spec.type) {
    case "range":
      return (
        <Slider
          label={spec.label}
          min={spec.min}
          max={spec.max}
          step={spec.step ?? (spec.max - spec.min > 20 ? 1 : 0.01)}
          unit={spec.unit || ""}
          value={resolved}
          onChange={onChange}
        />
      );
    case "color":
      return <ColorField label={spec.label} value={value} palette={palette} onChange={onChange} />;
    case "select": {
      const opts = spec.options || [];
      if (opts.length <= 3 || (opts.length === 4 && opts.every((o) => String(o.label).length <= 8))) {
        return (
          <div className="st-param">
            <span className="st-param__label" id={`p-${spec.key}`}>{spec.label}</span>
            <Segmented block size="sm" label={spec.label} options={opts.map((o) => ({ value: o.value, label: o.label }))} value={resolved} onChange={onChange} />
          </div>
        );
      }
      return <Select label={spec.label} options={opts} value={resolved} onChange={onChange} />;
    }
    case "toggle":
      return <Toggle block label={spec.label} checked={!!resolved} onChange={onChange} />;
    default:
      return null;
  }
}

/* ───────────────────────────── actions ───────────────────────────── */

export function useDownload({ effect, state, logo, toast }) {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // StrictMode re-mounts: set it again after the dev-only cleanup
    return () => { alive.current = false; };
  }, []);
  const run = async () => {
    if (!effect || !logo?.canvas || busy) return;
    setBusy(true);
    const team = teamLabel(state.team, state.contact, "team");
    const filename = `${slug(team) || "team"}-${slug(effect.name) || effect.id}.png`;
    const { params, seed } = state.effect;
    const key = `dl|${renderKey({ effectId: effect.id, logoKey: logo.key, palette: state.palette, params, seed, size: 2048, quality: "final" })}`;
    const t = scheduler.request(key, () => renderEffect(effect, logo.canvas, params, state.palette, { size: 2048, seed, quality: "final", logoKey: logo.key }), 60);
    try {
      const canvas = await t.promise;
      const blob = await canvasToBlob(canvas, "image/png");
      const res = await saveFile(filename, blob);
      if (res.ok) {
        toast({
          tone: "success",
          title: res.how === "downloads" ? `Saved ${filename}` : `Downloading ${filename}`,
          body: "2048 × 2048 px PNG with a transparent background.",
        });
      } else if (cantSaveHere(res)) {
        toast({ tone: "warning", title: CANT_SAVE_TITLE, body: `${filename} not saved. ${CANT_SAVE_BODY}`, duration: 9000 });
      } else {
        toast({ tone: res.code === "declined" ? "info" : "danger", title: "Download didn't finish", body: saveError(res) });
      }
    } catch (e) {
      if (!isAbort(e)) {
        console.error("[studio] download failed:", e);
        toast({ tone: "danger", title: "Couldn't build the full-size file", body: `${effect.name} failed at 2048 px. Try again, or pick another look.` });
      }
    } finally {
      t.release();
      if (alive.current) setBusy(false);
    }
  };
  return { busy, run };
}

export function InspectorActions({ effect, download, compact = false }) {
  return (
    <div className={cx("st-insp__actions", compact && "is-compact")}>
      <Button
        variant="secondary"
        size="lg"
        className="st-dl"
        icon={<Download aria-hidden="true" />}
        loading={download.busy}
        disabled={!effect}
        onClick={download.run}
        aria-label="Download PNG, 2048 px, transparent"
        title="Download a 2048 px PNG with a transparent background"
      >
        PNG
      </Button>
      <Button
        variant="team"
        size="lg"
        block
        iconRight={<ArrowRight aria-hidden="true" />}
        disabled={!effect}
        onClick={() => navigate("collection")}
      >
        Use this look
      </Button>
    </div>
  );
}

/* ───────────────────────────── composite (desktop / tablet column) ───────────────────────────── */

export function Inspector({ effect, state, actions, render, mock, backdrop, onBackdrop, view, onView, download, onToggleFavorite }) {
  return (
    <aside className="st-insp" id="st-insp" tabIndex={-1} aria-label={effect ? `${effect.name} settings` : "Selected look"}>
      <InspectorStage effect={effect} render={render} state={state} actions={actions} backdrop={backdrop} onBackdrop={onBackdrop} view={view} onView={onView} mock={mock} />
      <div className="st-insp__scroll">
        <InspectorHead effect={effect} favorite={!!effect && state.favorites.includes(effect.id)} onToggleFavorite={onToggleFavorite} />
        <InspectorControls effect={effect} state={state} actions={actions} />
      </div>
      <InspectorActions effect={effect} download={download} />
    </aside>
  );
}

export default Inspector;
