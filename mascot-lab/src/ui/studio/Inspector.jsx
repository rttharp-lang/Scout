// Mascot Lab — Studio inspector for the selected effect: big live preview with a
// backdrop switch, presets, the effect's own controls (from its ParamSpec), shuffle
// and reset, the look on the game jersey, Download PNG, and "Use this look".
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Download, RotateCcw, Shuffle } from "lucide-react";
import {
  Button, CanvasImage, Chip, ChipRow, ColorField, IconButton, Segmented, Select, Skeleton, Slider, SpecLabel, Spinner, Toggle, cx,
  navigate,
} from "../components/index.js";
import { CATEGORIES } from "../../engine/effects/index.js";
import { canvasToBlob, defaultParams, renderEffect, resolveParams } from "../../engine/render.js";
import { saveFile } from "../../platform/files.js";
import { resolveColors } from "../../apparel/collection.js";
import { stageStyle } from "./Gallery.jsx";
import { holdProps, isAbort, renderKey, scheduler, useEffectRender, useHeld } from "./renderKit.js";
import { JerseyThumb, ProductPreview } from "./ProductPreview.jsx";

export const INSPECTOR_SIZE = 1024;
const pad2 = (n) => String(n).padStart(2, "0");
const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || "Effect";
const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * useInspectorRender(effect, state, logo) → the 1024 "final" render. While it renders,
 * the 384 tile of the same settings stands in (it lands first: smaller, higher priority).
 * The big render waits while a slider is held down, and for a pause in the tuning.
 */
export function useInspectorRender(effect, state, logo) {
  const { params, seed } = state.effect;
  const held = useHeld();
  const placeholderKey = effect && logo?.key
    ? renderKey({ effectId: effect.id, logoKey: logo.key, palette: state.palette, params, seed, size: 384, quality: "preview" })
    : null;
  return useEffectRender({
    effect, logo, params, palette: state.palette, seed,
    size: INSPECTOR_SIZE, quality: "final", priority: 20, debounce: 380, placeholderKey, enabled: !held,
  });
}

/** Is the current look exactly this preset? (compares fully resolved params) */
function presetMatches(effect, preset, params, palette) {
  const a = resolveParams(effect, params, palette);
  const b = resolveParams(effect, preset.params, palette);
  return Object.keys(a).every((k) => a[k] === b[k]);
}

/* ───────────────────────────── head ───────────────────────────── */

export function InspectorHead({ effect, number, compact = false, aside = null }) {
  if (!effect) return <div className="st-insp__head"><Skeleton variant="text" lines={2} /></div>;
  return (
    <div className={cx("st-insp__head", compact && "is-compact", aside && "has-aside")}>
      <div className="st-insp__headtext">
        <div className="st-insp__kicker">
          <SpecLabel>FX {pad2(number)} · {catLabel(effect.category)}</SpecLabel>
          {!compact && <SpecLabel variant="box">{effect.method}</SpecLabel>}
        </div>
        {!compact && <h2 className="st-insp__title">{effect.name}</h2>}
        {effect.blurb && <p className="st-insp__blurb">{effect.blurb}</p>}
      </div>
      {aside}
    </div>
  );
}

/* ───────────────────────────── stage ───────────────────────────── */

const BACKDROPS = [
  { value: "stage", label: "Stage", title: "The effect's own backdrop" },
  { value: "garment", label: "Jersey", title: "The game jersey's base color" },
  { value: "checker", label: "Clear", title: "Transparent, as the PNG downloads" },
];

export function InspectorStage({ effect, render, state, backdrop, onBackdrop }) {
  const jersey = state.collection?.items?.jersey;
  const garmentColor = jersey ? resolveColors(jersey.colors, state.palette).base : state.palette.primary;
  const stage = !effect ? "surface" : backdrop === "checker" ? "checker" : backdrop === "garment" ? "none" : effect.stage;
  const style = backdrop === "garment" ? { background: garmentColor } : backdrop === "stage" && effect ? stageStyle(effect.stage, state.palette) : null;
  const rendering = render.status === "pending" || (!render.fresh && render.status !== "error");
  return (
    <div className="st-insp__stagewrap">
      <div className={cx("st-insp__stage", `ml-stage--${stage}`)} style={style || undefined} aria-busy={rendering || undefined}>
        {render.status === "error" ? (
          <div className="st-insp__error" role="alert">
            <SpecLabel variant="warning">Render failed</SpecLabel>
            <p>{effect?.name || "This effect"} couldn't draw your logo with these settings.</p>
            <Button size="sm" variant="secondary" onClick={render.retry}>Try again</Button>
          </div>
        ) : (
          <CanvasImage
            canvas={render.canvas}
            ratio={1}
            className="st-insp__canvas"
            alt={effect ? `Your logo in ${effect.name}` : "Loading preview"}
          />
        )}
        <div className="st-insp__backdrop">
          <Segmented size="sm" mono label="Preview backdrop" options={BACKDROPS} value={backdrop} onChange={onBackdrop} />
        </div>
        {rendering && render.canvas && (
          <span className="st-insp__busy" aria-hidden="true"><Spinner /> {render.placeholder ? "Sharpening" : "Rendering"}</span>
        )}
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
  const { params, seed } = state.effect;
  const defaults = defaultParams(effect);
  const value = (spec) => (params[spec.key] !== undefined ? params[spec.key] : defaults[spec.key]);
  const resolved = resolveParams(effect, params, state.palette);
  const set = (key, v) => actions.setEffectParams({ [key]: v });
  const presets = effect.presets || [];
  const dirty = Object.keys(params).length > 0 || seed !== 7;
  const activePreset = presets.find((pr) => presetMatches(effect, pr, params, state.palette));

  return (
    <div className="st-insp__controls" {...holdProps}>
      {presets.length > 1 && (
        <div className="st-insp__group">
          <div className="st-insp__label"><SpecLabel>Presets</SpecLabel></div>
          <ChipRow label="Presets">
            {presets.map((pr) => (
              <Chip
                key={pr.name}
                size="sm"
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
        <div className="st-insp__group st-params">
          <div className="st-insp__label"><SpecLabel>Adjust</SpecLabel></div>
          {effect.params.map((spec) => (
            <ParamControl key={spec.key} spec={spec} value={value(spec)} resolved={resolved[spec.key]} palette={state.palette} onChange={(v) => set(spec.key, v)} />
          ))}
        </div>
      )}

      <div className="st-insp__tools">
        <Button
          size="sm"
          variant="secondary"
          icon={<Shuffle aria-hidden="true" />}
          onClick={() => actions.setEffectSeed(nextSeed(seed))}
          title="Same settings, new random variation"
        >
          Shuffle
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw aria-hidden="true" />}
          disabled={!dirty}
          onClick={() => { actions.setEffectParams(null); actions.setEffectSeed(7); }}
        >
          Reset
        </Button>
        <SpecLabel className="st-insp__seed" k="Seed" v={String(seed).padStart(5, "0")} />
      </div>
    </div>
  );
}

function nextSeed(seed) {
  const x = Math.imul((seed >>> 0) ^ 0x9e3779b9, 2654435761) >>> 0;
  return (x % 99991) + 8;
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
      if (opts.length <= 4) {
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
    const team = [state.team.school, state.team.mascot].filter(Boolean).join(" ") || "team";
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
      } else {
        toast({ tone: res.code === "declined" ? "info" : "danger", title: "Download didn't finish", body: res.error || "The file couldn't be saved." });
      }
    } catch (e) {
      if (!isAbort(e)) {
        console.error("[studio] download failed:", e);
        toast({ tone: "danger", title: "Couldn't build the full-size file", body: `${effect.name} failed at 2048 px. Try again, or pick another effect.` });
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
      {compact ? (
        <IconButton
          size="lg"
          variant="secondary"
          label="Download PNG (2048 px, transparent)"
          icon={download.busy ? <Spinner /> : <Download aria-hidden="true" />}
          disabled={!effect || download.busy}
          onClick={download.run}
        />
      ) : (
        <Button
          variant="secondary"
          icon={<Download aria-hidden="true" />}
          loading={download.busy}
          disabled={!effect}
          onClick={download.run}
          aria-label="Download PNG, 2048 px, transparent"
          title="Download a 2048 px PNG with a transparent background"
        >
          PNG
        </Button>
      )}
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

export function Inspector({ effect, number, state, actions, render, mock, backdrop, onBackdrop, download }) {
  return (
    <aside className="st-insp" aria-label="Selected effect">
      <InspectorHead effect={effect} number={number} aside={<JerseyThumb mock={mock} effect={effect} />} />
      <InspectorStage effect={effect} render={render} state={state} backdrop={backdrop} onBackdrop={onBackdrop} />
      <div className="st-insp__scroll">
        <InspectorControls effect={effect} state={state} actions={actions} />
        <ProductPreview mock={mock} effect={effect} />
      </div>
      <InspectorActions effect={effect} download={download} />
    </aside>
  );
}

export default Inspector;
