// Collection page — the garment inspector: big front/back preview, colorway,
// graphics per view, lettering, per-garment download and reset. Docked beside the
// lookbook on wide screens; inside a Sheet below that (the page decides).
import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Plus, RotateCcw, X } from "lucide-react";
import {
  Button, CanvasImage, ColorField, Field, IconButton, Input, Segmented, SpecLabel, Toggle, cx,
} from "../components/index.js";
import { resolveColors } from "../../apparel/collection.js";
import { PRIORITY, SIZES, mockupInput } from "./render.js";
import { useMockup } from "./hooks.js";
import { PlacementEditor, newPlacement, zoneLabel } from "./PlacementEditor.jsx";
import { formatPrice } from "./format.js";
import { NoBreakTitle } from "./Title.jsx";

const VIEWS = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
];

/** Where each kind of lettering prints on this garment ("Back", "Front and back"). */
function letteringSpots(garment) {
  const spots = { name: [], number: [] };
  for (const v of ["front", "back"]) {
    const t = garment?.views?.[v]?.text;
    if (t?.name) spots.name.push(v);
    if (t?.number) spots.number.push(v);
  }
  const say = (list) => (list.length === 2 ? "Prints on the front and back" : list[0] === "front" ? "Prints on the front" : "Prints on the back");
  return { name: spots.name.length ? say(spots.name) : null, number: spots.number.length ? say(spots.number) : null };
}

/** Dashed outline of the zone being edited (clipped to the artboard; oversized zones crop). */
function ZoneBox({ zone }) {
  const x0 = Math.max(4, zone.x), y0 = Math.max(4, zone.y);
  const x1 = Math.min(996, zone.x + zone.w), y1 = Math.min(996, zone.y + zone.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return (
    <span
      className={cx("cl-zone", y0 < 90 && "is-top")}
      style={{ left: `${x0 / 10}%`, top: `${y0 / 10}%`, width: `${(x1 - x0) / 10}%`, height: `${(y1 - y0) / 10}%` }}
      aria-hidden="true"
    >
      <span className="cl-zone__tag">{zone.label}</span>
    </span>
  );
}

function PreviewPane({ garment, view, m, artReady, active, onSelect, zone, label }) {
  const Tag = active ? "div" : "button";
  const props = active ? {} : { type: "button", onClick: onSelect, "aria-label": `Edit the ${label.toLowerCase()}` };
  return (
    <Tag className={cx("cl-insp__pane", active && "is-active")} {...props}>
      <CanvasImage
        className="cl-stage"
        canvas={m.canvas}
        ratio={1}
        loading={(m.pending || !artReady) && !!m.canvas}
        error={m.error ? "Preview unavailable" : null}
        alt={`${garment.name}, ${view}`}
      >
        {active && zone && <ZoneBox zone={zone} />}
      </CanvasImage>
      <span className="cl-insp__pane-label">{label}{active ? " · editing" : ""}</span>
    </Tag>
  );
}

/**
 * MiniPreview — once the big preview scrolls out of view, a compact front/back strip
 * pins to the top of the scroll area, so slider changes stay visible. It takes no
 * layout space (height 0, sticky), so pinning never shifts the controls.
 */
function MiniPreview({ garment, view, front, back, pinned, onView }) {
  const panes = [["front", front], ["back", back]];
  return (
    <div className={cx("cl-insp__mini", pinned && "is-on")} aria-hidden={!pinned || undefined}>
      <div className="cl-insp__mini-bar" {...(pinned ? {} : { inert: "" })}>
        {panes.map(([v, m]) => (
          <button
            key={v}
            type="button"
            className={cx("cl-insp__mini-pane", v === view && "is-active")}
            onClick={() => onView(v)}
            aria-label={v === view ? `${garment.name}, ${v} (editing)` : `Edit the ${v}`}
            aria-pressed={v === view}
          >
            <CanvasImage className="cl-stage" canvas={m.canvas} ratio={1} alt="" />
            <span>{v === "front" ? "Front" : "Back"}</span>
          </button>
        ))}
        {/* the panel header already names the garment */}
        <span className="cl-insp__mini-text">
          <strong>Editing the {view}</strong>
        </span>
      </div>
    </div>
  );
}

/** Pin the mini preview when `target` has mostly scrolled out of its scroll container. */
function usePinned(target) {
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const el = target.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const root = el.closest(".cl-insp__scroll, .ml-dialog__body");
    const io = new IntersectionObserver(([e]) => {
      const above = e.boundingClientRect.top < (e.rootBounds?.top ?? 0);
      setPinned(above && e.intersectionRatio < 0.3);
    }, { root, threshold: [0, 0.3, 0.6, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [target]);
  return pinned;
}

/**
 * InspectorContent — the scrolling body (preview + sections). Used by both the docked
 * panel and the Sheet.
 */
export function InspectorContent({ garment, item, product, look, palette, preview, onPreview, actions, view, onView, showNav, nav }) {
  const [openIdx, setOpenIdx] = useState(0);
  const placements = item?.[view] || [];
  const zones = garment.views?.[view]?.zones || {};
  const colors = resolveColors(item?.colors, palette);
  const effectName = look.effectName;
  const other = view === "front" ? "back" : "front";
  const open = placements[openIdx];
  const openZone = open && open.mode !== "tile" && zones[open.zone] ? { ...zones[open.zone], label: zoneLabel(zones, open.zone) } : null;
  const spots = letteringSpots(garment);
  const hasText = !!(spots.name || spots.number);

  useEffect(() => { setOpenIdx(0); }, [view, garment.id]);

  // both sides render once; the big preview and the pinned mini strip share the canvases
  const artReady = !!(look.art || look.clean);
  const mk = (v) => mockupInput({ garment, view: v, item, palette, art: look.art, clean: look.clean, size: SIZES.inspector, preview });
  const mFront = useMockup(mk("front"), PRIORITY.inspector);
  const mBack = useMockup(mk("back"), PRIORITY.inspector);
  const mView = view === "front" ? mFront : mBack;
  const mOther = view === "front" ? mBack : mFront;
  const previewRef = useRef(null);
  const pinned = usePinned(previewRef);

  const update = (patch) => actions.updateItem(garment.id, patch);
  const setPlacement = (i, patch) =>
    actions.updateItem(garment.id, (it) => ({ [view]: (it[view] || []).map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const removePlacement = (i) => {
    actions.updateItem(garment.id, (it) => ({ [view]: (it[view] || []).filter((_, j) => j !== i) }));
    setOpenIdx((o) => (o === i ? -1 : o > i ? o - 1 : o));
  };
  const addPlacement = () => {
    const p = newPlacement(zones, placements);
    actions.updateItem(garment.id, (it) => ({ [view]: [...(it[view] || []), p] }));
    setOpenIdx(placements.length);
  };
  const setText = (key, on) =>
    actions.updateItem(garment.id, (it) => ({ text: { name: false, number: false, ...(it.text || {}), [key]: on } }));

  return (
    <div className="cl-insp__content">
      <MiniPreview garment={garment} view={view} front={mFront} back={mBack} pinned={pinned} onView={onView} />
      <div className="cl-insp__preview" ref={previewRef}>
        <PreviewPane garment={garment} view={view} m={mView} artReady={artReady} active zone={openZone} label={view === "front" ? "Front" : "Back"} />
        <PreviewPane garment={garment} view={other} m={mOther} artReady={artReady} active={false} onSelect={() => onView(other)} label={other === "front" ? "Front" : "Back"} />
      </div>

      <div className="cl-insp__status">
        <Toggle checked={item?.enabled !== false} onChange={(v) => update({ enabled: v })} label="In the order" />
        {showNav ? nav : product && <span className="cl-insp__price">{formatPrice(product.price)} <small>per piece</small></span>}
      </div>

      <section className="cl-insp__sec" aria-labelledby="cl-insp-colors">
        <h3 className="cl-insp__h" id="cl-insp-colors">Colorway</h3>
        <ColorField label="Base" value={item?.colors?.base ?? "primary"} palette={palette} onChange={(v) => update({ colors: { base: v } })} />
        <ColorField label="Trim" value={item?.colors?.trim ?? "secondary"} palette={palette} onChange={(v) => update({ colors: { trim: v } })} />
        <ColorField label="Accent" value={item?.colors?.accent ?? "accent"} palette={palette} hint="Accent colors lettering and one-ink prints." onChange={(v) => update({ colors: { accent: v } })} />
      </section>

      <section className="cl-insp__sec" aria-labelledby="cl-insp-graphics">
        <div className="cl-insp__sechead">
          <h3 className="cl-insp__h" id="cl-insp-graphics">Graphics</h3>
          <Segmented size="sm" mono label="Side to edit" options={VIEWS} value={view} onChange={onView} />
        </div>
        {placements.length === 0 ? (
          <p className="cl-insp__empty">Nothing prints on the {view}. Add a graphic, or leave it clean.</p>
        ) : (
          <div className="cl-insp__places">
            {placements.map((p, i) => (
              <PlacementEditor
                key={`${view}-${i}`}
                placement={p}
                index={i}
                zones={zones}
                effectName={effectName}
                baseHex={colors.base}
                viewLabel={view}
                open={openIdx === i}
                onToggle={() => setOpenIdx((o) => (o === i ? -1 : i))}
                onChange={(patch) => setPlacement(i, patch)}
                onRemove={() => removePlacement(i)}
              />
            ))}
          </div>
        )}
        <Button variant="secondary" size="sm" icon={<Plus aria-hidden="true" />} onClick={addPlacement} disabled={placements.length >= 4}>
          Add a graphic to the {view}
        </Button>
      </section>

      {hasText && (
        <section className="cl-insp__sec" aria-labelledby="cl-insp-text">
          <h3 className="cl-insp__h" id="cl-insp-text">Lettering</h3>
          {spots.name && (
            <Toggle block checked={!!item?.text?.name} onChange={(v) => setText("name", v)} label="Player name" description={spots.name} />
          )}
          {spots.number && (
            <Toggle block checked={!!item?.text?.number} onChange={(v) => setText("number", v)} label="Number" description={spots.number} />
          )}
          <div className="cl-insp__letters">
            <Field label="Preview name">
              <Input
                value={preview.name}
                maxLength={14}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => onPreview({ ...preview, name: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Preview number">
              <Input
                value={preview.number}
                maxLength={2}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => onPreview({ ...preview, number: e.target.value.replace(/[^0-9]/g, "") })}
              />
            </Field>
          </div>
          <p className="cl-insp__note">Preview only. Each player's name and number come from your roster on the order page.</p>
        </section>
      )}
    </div>
  );
}

/**
 * Footer buttons: reset (with an inline undo right after, since toasts can't take clicks
 * while a Sheet holds focus) + per-garment download.
 */
export function InspectorActions({ garment, item, onDownload, downloading, onReset, undo }) {
  return (
    <>
      {undo ? (
        <span className="cl-insp__undo" role="status">
          <span>Back to the {undo.styleName} layout.</span>
          <Button variant="secondary" size="sm" icon={<RotateCcw aria-hidden="true" />} onClick={undo.run}>Undo</Button>
        </span>
      ) : (
        <Button variant="ghost" size="sm" icon={<RotateCcw aria-hidden="true" />} onClick={onReset} disabled={!item?.custom} title={item?.custom ? undefined : "No changes to reset"}>
          Reset this garment
        </Button>
      )}
      <Button variant="secondary" size="sm" icon={<Download aria-hidden="true" />} loading={downloading} onClick={onDownload} aria-label={`Download ${garment.name} as PNG`}>
        {downloading ? "Rendering" : "Download PNG"}
      </Button>
    </>
  );
}

/** Prev / next garment arrows. */
export function InspectorNav({ index, total, onPrev, onNext, compact = false }) {
  return (
    <div className={cx("cl-insp__nav", compact && "is-compact")}>
      <IconButton size="sm" variant="secondary" label="Previous garment" icon={<ChevronLeft aria-hidden="true" />} onClick={onPrev} disabled={total < 2} />
      <span className="cl-insp__count" aria-live="polite">{index + 1} / {total}</span>
      <IconButton size="sm" variant="secondary" label="Next garment" icon={<ChevronRight aria-hidden="true" />} onClick={onNext} disabled={total < 2} />
    </div>
  );
}

/** Docked inspector (wide screens): sticky panel beside the lookbook grid. */
export function DockedInspector({ garment, index, total, onClose, onPrev, onNext, actionsSlot, children }) {
  const headRef = useRef(null);
  useEffect(() => { headRef.current?.focus({ preventScroll: true }); }, [garment.id]);
  return (
    <aside className="cl-insp" aria-labelledby="cl-insp-title">
      <header className="cl-insp__head">
        <div className="cl-insp__headrow">
          <SpecLabel>{garment.styleCode} · {garment.category === "uniform" ? "Game uniform" : "Warm-up"}</SpecLabel>
          <InspectorNav index={index} total={total} onPrev={onPrev} onNext={onNext} compact />
          <IconButton label="Close editor" icon={<X aria-hidden="true" />} onClick={onClose} />
        </div>
        <h2 className="cl-insp__title" id="cl-insp-title" ref={headRef} tabIndex={-1}><NoBreakTitle text={garment.name} /></h2>
      </header>
      <div className="cl-insp__scroll">{children}</div>
      <footer className="cl-insp__foot">{actionsSlot}</footer>
    </aside>
  );
}
