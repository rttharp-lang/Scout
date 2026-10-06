// Mascot Lab — Collection (#collection): the chosen look across the whole team
// collection. Pick a drop style, set team colours, flip and include/exclude pieces,
// edit any piece in the inspector, download the line sheet, then go to order.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FileImage } from "lucide-react";
import { useStore } from "../../state/store.jsx";
import { DROP_STYLES, buildCollection, getDropStyle } from "../../apparel/collection.js";
import { PRODUCTS } from "../../order/catalog.js";
import * as storage from "../../platform/storage.js";
import {
  Button, Notice, Sheet, SpecLabel, Toggle, cx, navigate, useToast,
} from "../components/index.js";
import { useGarments, useInView, useLookArt, useMediaQuery } from "../collection/hooks.js";
import { SIZES } from "../collection/render.js";
import { GarmentCard, GarmentCardSkeleton } from "../collection/GarmentCard.jsx";
import { DropStylePicker } from "../collection/DropStylePicker.jsx";
import { LookPanel } from "../collection/LookPanel.jsx";
import { DockedInspector, InspectorActions, InspectorContent, InspectorNav } from "../collection/Inspector.jsx";
import { downloadGarment, downloadLineSheet, saveToast } from "../collection/exports.js";
import { formatPrice, plural } from "../collection/format.js";
import { NoBreakTitle } from "../collection/Title.jsx";
import "./collection.css";

const UI_KEY = "mascot-lab:collection-ui";

/** One line under the "Drop style" heading for the chosen style (falls back to the recipe's note). */
const STYLE_NOTES = {
  statement: "One giant graphic per piece, cropped hard by the seams, the way pro warm-up drops are built.",
  classic: "Clean logo crests, numbers on the jersey and shooting shirt, and your look as one bigger hit on the hoodie and tee.",
  allover: "A brick-repeat print on every panel. Full color on the jersey, shorts and tee, one ink on the rest.",
  tonal: "Graphics a shade off the garment color. Reads up close, quiet from across the gym.",
};

function defaultPreview(team) {
  const m = String(team?.mascot || team?.school || "TEAM").trim().toUpperCase();
  return { name: m.slice(0, 14), number: "23" };
}

/** A stored { name, number } preview, or null if it isn't one. */
function validPreview(v) {
  if (!v || typeof v !== "object") return null;
  const name = typeof v.name === "string" ? v.name.toUpperCase().slice(0, 14) : "";
  const number = typeof v.number === "string" ? v.number.replace(/[^0-9]/g, "").slice(0, 2) : "";
  return { name, number };
}

export default function Collection() {
  const { state, actions } = useStore();
  const { toast } = useToast();
  const look = useLookArt();
  const { garments } = useGarments();
  const docked = useMediaQuery("(min-width: 1180px)");
  const phone = useMediaQuery("(max-width: 720px)");
  const hiDpi = typeof window !== "undefined" && (window.devicePixelRatio || 1) >= 1.5;

  const { collection, palette, team } = state;
  const items = collection.items;
  const dropStyle = getDropStyle(collection.dropStyle) || DROP_STYLES[0];

  // per-viewer conveniences (survive reloads on this device only)
  const [showBacks, setShowBacks] = useState(() => !!storage.load(UI_KEY)?.showBacks);
  const [flips, setFlips] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [inspView, setInspView] = useState("front");
  const [previewOverride, setPreviewOverride] = useState(() => validPreview(storage.load(UI_KEY)?.preview));
  useEffect(() => { storage.save(UI_KEY, { showBacks, preview: previewOverride }); }, [showBacks, previewOverride]);
  const preview = previewOverride || defaultPreview(team);
  const [busy, setBusy] = useState({ sheet: false, garment: null });
  const openRefs = useRef({});
  const ctaRef = useRef(null);
  const ctaInView = useInView(ctaRef, "0px");
  const heroCtaRef = useRef(null);
  const heroCtaInView = useInView(heroCtaRef, "0px");
  const hideDock = ctaInView || heroCtaInView;

  const pieces = useMemo(() => (garments || []).filter((g) => items[g.id]), [garments, items]);
  const included = pieces.filter((g) => items[g.id].enabled !== false);
  const kitPrice = included.reduce((sum, g) => sum + (PRODUCTS[g.id]?.price || 0), 0);
  const loadingGarments = garments === null;
  // while the garment drawings load, the order buttons go by the recipe (they only navigate)
  const canOrder = loadingGarments ? Object.values(items).some((it) => it.enabled !== false) : included.length > 0;
  const selIndex = pieces.findIndex((g) => g.id === selectedId);
  const selected = selIndex >= 0 ? pieces[selIndex] : null;
  // the Sheet keeps showing the last garment while it animates closed
  const lastSelected = useRef(null);
  if (selected) lastSelected.current = selected;
  const sheetGarment = selected || lastSelected.current;
  const lookForCards = useMemo(
    () => ({ art: look.art, clean: look.clean }),
    [look.art, look.clean],
  );
  const effectName = (look.effect || look.original)?.name || "Look";
  const inspectorLook = useMemo(() => ({ ...lookForCards, effectName }), [lookForCards, effectName]);
  const cardSize = hiDpi && !phone ? SIZES.cardLarge : SIZES.card;

  /* ── actions ── */

  const onToggleBacks = (v) => { setShowBacks(v); setFlips({}); };
  const viewOf = (id) => flips[id] || (showBacks ? "back" : "front");

  const openGarment = useCallback((id, view) => {
    setSelectedId(id);
    setInspView(view || "front");
  }, []);
  const closeInspector = useCallback(() => {
    const id = selectedId;
    setSelectedId(null);
    if (id) setTimeout(() => openRefs.current[id]?.focus({ preventScroll: true }), 0);
  }, [selectedId]);
  const step = (dir) => {
    if (!pieces.length) return;
    const n = (selIndex + dir + pieces.length) % pieces.length;
    setSelectedId(pieces[n].id);
  };

  // Esc closes the docked inspector (the Sheet handles its own Esc)
  useEffect(() => {
    if (!docked || !selectedId) return;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".ml-overlay")) return;
      // Esc inside a text field belongs to the field (ColorField uses it to undo typing)
      if (e.target?.closest?.("input:not([type=range]):not([type=color]), textarea")) return;
      closeInspector();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [docked, selectedId, closeInspector]);

  // a garment that disappears (registry reload) closes the inspector
  useEffect(() => {
    if (selectedId && garments && !pieces.some((g) => g.id === selectedId)) setSelectedId(null);
  }, [selectedId, garments, pieces]);

  const onDropStyle = (id) => {
    if (id === collection.dropStyle) return;
    const prev = collection;
    const edited = Object.values(prev.items).filter((it) => it.custom).length;
    const name = getDropStyle(id)?.name || id;
    actions.setDropStyle(id);
    if (edited) {
      toast({
        title: `Switched to ${name}`,
        body: `Your edits to ${plural(edited, "piece")} were replaced by the ${name} layout.`,
        action: { label: "Undo", onClick: () => actions.setCollection(prev) },
        duration: 8000,
      });
    }
  };

  const [resetUndo, setResetUndo] = useState(null); // { garmentId, styleName, run }
  useEffect(() => {
    if (!resetUndo) return;
    const t = setTimeout(() => setResetUndo(null), 10000);
    return () => clearTimeout(t);
  }, [resetUndo]);
  const onReset = (g) => {
    const prevItem = items[g.id];
    const fresh = buildCollection(collection.dropStyle, palette).items[g.id];
    if (!prevItem || !fresh) return;
    actions.setCollection({ ...collection, items: { ...items, [g.id]: { ...fresh, enabled: prevItem.enabled !== false } } });
    setResetUndo({
      garmentId: g.id,
      styleName: dropStyle.name,
      run: () => { actions.updateItem(g.id, { ...prevItem }); setResetUndo(null); },
    });
  };

  const exportCtx = () => ({
    state,
    logo: look.logo,
    effect: look.effect,
    original: look.original,
    garments: pieces,
    preview,
  });
  const canExport = !!look.logo?.canvas && pieces.length > 0;

  const onLineSheet = async () => {
    if (busy.sheet) return;
    if (!included.length) {
      toast({ tone: "warning", title: "Nothing to put on the line sheet", body: "Add at least one piece to the order first." });
      return;
    }
    setBusy((b) => ({ ...b, sheet: true }));
    try {
      const r = await downloadLineSheet(exportCtx());
      toast(saveToast(r.result, { what: "Line sheet", filename: r.filename, detail: r.detail }));
    } catch (err) {
      console.error("[collection] line sheet failed:", err);
      toast({ tone: "danger", title: "Line sheet not saved", body: err?.message || "Something went wrong while drawing it." });
    } finally {
      setBusy((b) => ({ ...b, sheet: false }));
    }
  };

  const onGarmentPng = async (g) => {
    if (busy.garment) return;
    setBusy((b) => ({ ...b, garment: g.id }));
    try {
      const r = await downloadGarment(exportCtx(), g);
      toast(saveToast(r.result, { what: `${g.name} image`, filename: r.filename, detail: r.detail }));
    } catch (err) {
      console.error("[collection] garment export failed:", err);
      toast({ tone: "danger", title: `${g.name} image not saved`, body: err?.message || "Something went wrong while drawing it." });
    } finally {
      setBusy((b) => ({ ...b, garment: null }));
    }
  };

  const goOrder = () => { if (canOrder) navigate("order"); };
  const orderCount = !loadingGarments && included.length > 0 && (
    <span className="cl-count">
      <span className="visually-hidden">, </span>{included.length}<span className="visually-hidden">{included.length === 1 ? " piece" : " pieces"}</span>
    </span>
  );

  /* ── render ── */

  const mascot = String(team?.mascot || "").trim();
  const title = mascot ? `The ${mascot} collection` : "Your collection";

  const inspGarment = docked ? selected : sheetGarment;
  const inspIndex = inspGarment ? pieces.findIndex((g) => g.id === inspGarment.id) : -1;
  const inspector = inspGarment && (
    <InspectorContent
      key={inspGarment.id}
      garment={inspGarment}
      item={items[inspGarment.id]}
      product={PRODUCTS[inspGarment.id]}
      look={inspectorLook}
      palette={palette}
      preview={preview}
      onPreview={setPreviewOverride}
      actions={actions}
      view={inspView}
      onView={setInspView}
      showNav={!docked}
      nav={<InspectorNav index={inspIndex} total={pieces.length} onPrev={() => step(-1)} onNext={() => step(1)} compact />}
    />
  );
  const inspectorActions = inspGarment && (
    <InspectorActions
      garment={inspGarment}
      item={items[inspGarment.id]}
      downloading={busy.garment === inspGarment.id}
      onDownload={() => onGarmentPng(inspGarment)}
      onReset={() => onReset(inspGarment)}
      undo={resetUndo?.garmentId === inspGarment.id ? resetUndo : null}
    />
  );

  return (
    <div className={cx("cl-page", phone && "has-dock")}>
      {/* ── masthead ── */}
      <section className="container cl-hero" aria-labelledby="cl-title">
        <div className="cl-hero__copy">
          <SpecLabel size="lg">Step 02 / 03 · Collection</SpecLabel>
          <h1 className="cl-hero__title" id="cl-title">{title}</h1>
          <p className="lead">Your look on every piece of the kit. Pick a drop style, fine-tune any piece, then order for the roster.</p>
          <div className="cl-hero__ctas" ref={heroCtaRef}>
            <Button size="lg" iconRight={<ArrowRight aria-hidden="true" />} onClick={goOrder} disabled={!canOrder}>
              Order this collection{orderCount}
            </Button>
            <Button size="lg" variant="secondary" icon={<FileImage aria-hidden="true" />} onClick={onLineSheet} loading={busy.sheet} disabled={!canExport}>
              {busy.sheet ? "Drawing line sheet" : "Download line sheet"}
            </Button>
          </div>
          <p className="cl-hero__sum">
            {loadingGarments ? (
              <SpecLabel>Loading pieces</SpecLabel>
            ) : (
              <>
                <SpecLabel k="In the order" v={plural(included.length, "piece")} />
                {kitPrice > 0 && <SpecLabel k="Full kit" v={`${formatPrice(kitPrice)} per player`} />}
              </>
            )}
          </p>
        </div>
        <LookPanel look={look} palette={palette} onPalette={actions.setPalette} />
      </section>

      {look.status === "error" && (
        <div className="container cl-notices">
          <Notice tone="danger" title="We couldn't read your logo" action={<Button size="sm" variant="secondary" onClick={() => navigate("studio")}>Open the studio</Button>}>
            Upload it again in the studio. PNG, JPG or SVG files work best.
          </Notice>
        </div>
      )}
      {look.error && (
        <div className="container cl-notices">
          <Notice tone="warning" title={`The ${effectName} look didn't render`}>
            The pieces below show your clean logo for now. Try another look in the studio.
          </Notice>
        </div>
      )}

      {/* ── drop style ── */}
      <section className="container cl-block" aria-labelledby="cl-styles-h">
        <header className="cl-block__head">
          <h2 className="cl-block__title" id="cl-styles-h">Drop style</h2>
          <p className="cl-block__sub">{STYLE_NOTES[dropStyle.id] || dropStyle.note || dropStyle.blurb}</p>
        </header>
        <DropStylePicker
          value={collection.dropStyle}
          onChange={onDropStyle}
          garments={garments}
          look={lookForCards}
          palette={palette}
          preview={preview}
        />
      </section>

      {/* ── lookbook ── */}
      <section className="container cl-block cl-book-wrap" aria-labelledby="cl-book-h">
        <header className="cl-block__head cl-book__head">
          <div className="cl-book__titles">
            <h2 className="cl-block__title" id="cl-book-h">Lookbook</h2>
            <SpecLabel>
              {loadingGarments ? "Loading pieces" : `${plural(pieces.length, "piece")} · ${included.length} in the order`}
            </SpecLabel>
          </div>
          <div className="cl-book__tools">
            <Toggle checked={showBacks} onChange={onToggleBacks} label="Show backs" />
            <Button variant="secondary" size="sm" icon={<FileImage aria-hidden="true" />} onClick={onLineSheet} loading={busy.sheet} disabled={!canExport}>
              {busy.sheet ? "Drawing" : "Line sheet"}
            </Button>
          </div>
        </header>

        <div className={cx("cl-book", docked && selected && "has-inspector")}>
          <div className="cl-grid" role="list" aria-label="Pieces in the collection">
            {loadingGarments
              ? Array.from({ length: 6 }, (_, i) => <div role="listitem" key={i}><GarmentCardSkeleton /></div>)
              : pieces.map((g) => (
                <div role="listitem" key={g.id}>
                  <GarmentCard
                    garment={g}
                    item={items[g.id]}
                    product={PRODUCTS[g.id]}
                    view={viewOf(g.id)}
                    onView={(v) => setFlips((f) => ({ ...f, [g.id]: v }))}
                    onToggle={(v) => actions.updateItem(g.id, { enabled: v })}
                    onOpen={() => (selectedId === g.id && docked ? closeInspector() : openGarment(g.id, viewOf(g.id)))}
                    selected={selectedId === g.id}
                    look={lookForCards}
                    palette={palette}
                    preview={preview}
                    size={cardSize}
                    openRef={(el) => { openRefs.current[g.id] = el; }}
                  />
                </div>
              ))}
          </div>
          {!loadingGarments && pieces.length === 0 && (
            <Notice tone="warning" title="No garments to show yet">
              The garment drawings didn't load. Reload the page to try again.
            </Notice>
          )}
          {docked && selected && (
            <DockedInspector
              garment={selected}
              index={selIndex}
              total={pieces.length}
              onClose={closeInspector}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              actionsSlot={inspectorActions}
            >
              {inspector}
            </DockedInspector>
          )}
        </div>
      </section>

      {/* ── closing CTA ── */}
      <section className="container cl-block">
        <div className="cl-cta" ref={ctaRef}>
          <div className="cl-cta__copy">
            <SpecLabel className="cl-cta__kicker">Next · Step 03</SpecLabel>
            <h2 className="cl-cta__title">Ready for sizes?</h2>
            <p>Add your roster and sizes on the next page. You approve a proof before anything is printed.</p>
          </div>
          <div className="cl-cta__side">
            <dl className="cl-cta__facts">
              <div><dt>Pieces</dt><dd>{included.length}</dd></div>
              <div><dt>Full kit</dt><dd>{kitPrice > 0 ? formatPrice(kitPrice) : "—"}<small>per player</small></dd></div>
            </dl>
            <Button size="lg" variant="team" iconRight={<ArrowRight aria-hidden="true" />} onClick={goOrder} disabled={!canOrder}>
              Order this collection{orderCount}
            </Button>
            {!canOrder && <p className="cl-cta__hint">Turn on at least one piece to order.</p>}
          </div>
        </div>
      </section>

      {/* ── phone: sticky order bar ── */}
      {phone && (
        <div className={cx("cl-dock", hideDock && "is-hidden")} role="region" aria-label="Order this collection" {...(hideDock ? { inert: "" } : {})}>
          <div className="cl-dock__sum">
            <strong>{plural(included.length, "piece")}</strong>
            <span>{kitPrice > 0 ? `${formatPrice(kitPrice)} per player` : "Nothing selected"}</span>
          </div>
          <Button variant="team" iconRight={<ArrowRight aria-hidden="true" />} onClick={goOrder} disabled={!canOrder}>
            Order
          </Button>
        </div>
      )}

      {/* ── inspector as a sheet below the docked breakpoint ── */}
      {!docked && (
        <Sheet
          open={!!selected}
          onClose={closeInspector}
          kicker={sheetGarment ? `${sheetGarment.styleCode} · ${formatPrice(PRODUCTS[sheetGarment.id]?.price) || (sheetGarment.category === "uniform" ? "Game uniform" : "Warm-up")}${PRODUCTS[sheetGarment.id] ? " per piece" : ""}` : undefined}
          title={sheetGarment ? <NoBreakTitle text={sheetGarment.name} /> : undefined}
          width={520}
          className="cl-sheet"
          footer={inspectorActions}
        >
          {inspector}
        </Sheet>
      )}
    </div>
  );
}
