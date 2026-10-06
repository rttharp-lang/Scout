// Collection page — one graphic placement on a garment view, as a collapsible row:
// artwork source, zone, size, offset, rotation, single/repeat, ink and opacity.
import React, { useId } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { IconButton, Segmented, Select, Slider, cx } from "../components/index.js";
import { tonalTint } from "../../apparel/collection.js";
import { deg, pct, signedPct } from "./format.js";

/** Zones where the clean logo reads better than an effect (small hits). */
const SMALL_ZONES = new Set(["chest-left", "chest-center", "back-yoke", "waist-back", "leg-left", "leg-right", "thigh-left", "hood", "pouch", "back-leg"]);
const ZONE_PREF = ["chest-left", "center", "back-center", "back-yoke", "leg-left", "thigh-left", "leg-left-long", "waist-back", "back-leg", "chest-center", "oversized"];

/** A sensible new placement for a view: the first preferred zone not used yet. */
export function newPlacement(zones, existing = []) {
  const ids = Object.keys(zones || {});
  const used = new Set(existing.map((p) => p.zone));
  const zone = [...ZONE_PREF, ...ids].find((z) => zones?.[z] && !used.has(z)) || ids[0] || "center";
  return {
    source: SMALL_ZONES.has(zone) ? "logo" : "effect",
    zone, scale: 1, dx: 0, dy: 0, rotate: 0, mode: "single", tile: 220, opacity: 1, tint: null, blend: "normal",
  };
}

/** Ink mode of a placement: full colour, tonal (a shade off the base) or one flat ink. */
export function inkMode(p, baseHex) {
  if (!p?.tint) return "full";
  if (p.tint === "tonal") return "tonal";
  if (typeof p.tint === "string" && baseHex && p.tint.toUpperCase() === tonalTint(baseHex).toUpperCase()) return "tonal";
  return "ink";
}
const INK_TINT = { full: null, tonal: "tonal", ink: "accent" };

export function zoneLabel(zones, id) {
  const z = zones?.[id];
  if (z?.label) return z.label;
  return String(id || "").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function PlacementEditor({ placement: p, index, zones, effectName, open, onToggle, onChange, onRemove, baseHex, viewLabel }) {
  const id = useId();
  const sourceLabel = p.source === "logo" ? "Clean logo" : effectName;
  const ink = inkMode(p, baseHex);
  const zoneMissing = !zones?.[p.zone];
  const zoneOptions = Object.keys(zones || {}).map((z) => ({ value: z, label: zones[z].label || zoneLabel(zones, z) }));
  if (zoneMissing) zoneOptions.unshift({ value: p.zone, label: `${zoneLabel(zones, p.zone)} (not on this piece)` });
  const set = (patch) => onChange(patch);
  const isTile = p.mode === "tile";

  return (
    <div className={cx("cl-place", open && "is-open")}>
      <div className="cl-place__head">
        <button
          type="button"
          className="cl-place__toggle"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={onToggle}
        >
          <span className="cl-place__n" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <span className="cl-place__sum">
            <strong>{sourceLabel}</strong>
            <span>{isTile ? "Repeat print, edge to edge" : zoneLabel(zones, p.zone)} · {pct(p.scale ?? 1)}</span>
          </span>
          <ChevronDown className="cl-place__chev" aria-hidden="true" />
        </button>
        <IconButton size="sm" label={`Remove graphic ${index + 1} from the ${viewLabel}`} icon={<Trash2 aria-hidden="true" />} onClick={onRemove} />
      </div>
      {open && (
        <div className="cl-place__body" id={`${id}-body`}>
          <div className="cl-place__row">
            <span className="cl-place__label" id={`${id}-src`}>Artwork</span>
            <Segmented
              size="sm"
              block
              aria-labelledby={`${id}-src`}
              options={[{ value: "effect", label: effectName }, { value: "logo", label: "Clean logo" }]}
              value={p.source === "logo" ? "logo" : "effect"}
              onChange={(v) => set({ source: v })}
            />
          </div>
          {!isTile && <Select label="Position" value={p.zone} options={zoneOptions} onChange={(v) => set({ zone: v })} />}
          <div className="cl-place__row">
            <span className="cl-place__label" id={`${id}-mode`}>Layout</span>
            <Segmented
              size="sm"
              block
              aria-labelledby={`${id}-mode`}
              options={[{ value: "single", label: "Single hit" }, { value: "tile", label: "Repeat print" }]}
              value={isTile ? "tile" : "single"}
              onChange={(v) => set({ mode: v })}
            />
          </div>
          <div className="cl-place__grid">
            {/* pairs read across: size + rotate (or repeat + graphic), then the offsets */}
            {isTile ? (
              <>
                <Slider label="Repeat size" min={100} max={420} step={5} value={p.tile ?? 220} format={(v) => `${Math.round(v / 10)}%`} onChange={(v) => set({ tile: v })} />
                <Slider label="Graphic size" min={0.2} max={1.6} step={0.01} value={p.scale ?? 1} format={pct} onChange={(v) => set({ scale: v })} />
              </>
            ) : (
              <>
                <Slider label="Size" min={0.2} max={1.6} step={0.01} value={p.scale ?? 1} format={pct} onChange={(v) => set({ scale: v })} />
                <Slider label="Rotate" min={-180} max={180} step={1} value={p.rotate ?? 0} format={deg} onChange={(v) => set({ rotate: v })} />
              </>
            )}
            <Slider label={isTile ? "Shift left / right" : "Left / right"} min={-0.6} max={0.6} step={0.01} value={p.dx ?? 0} format={signedPct} onChange={(v) => set({ dx: v })} />
            <Slider label={isTile ? "Shift up / down" : "Up / down"} min={-0.6} max={0.6} step={0.01} value={p.dy ?? 0} format={signedPct} onChange={(v) => set({ dy: v })} />
            {isTile && <Slider label="Rotate" min={-180} max={180} step={1} value={p.rotate ?? 0} format={deg} onChange={(v) => set({ rotate: v })} />}
            <Slider label="Opacity" min={0.1} max={1} step={0.05} value={p.opacity ?? 1} format={pct} onChange={(v) => set({ opacity: v })} />
          </div>
          <div className="cl-place__row">
            <span className="cl-place__label" id={`${id}-ink`}>Ink</span>
            <Segmented
              size="sm"
              block
              aria-labelledby={`${id}-ink`}
              options={[{ value: "full", label: "Full color" }, { value: "tonal", label: "Tonal" }, { value: "ink", label: "One ink" }]}
              value={ink}
              onChange={(v) => set({ tint: INK_TINT[v] })}
            />
            <p className="cl-place__note">
              {ink === "tonal" ? "Printed a shade off the garment color. Quiet from a distance."
                : ink === "ink" ? "One flat ink in this piece's accent color."
                : "Every color in the artwork, as shown."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
