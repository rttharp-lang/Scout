// Mascot Lab — Studio (#studio). Logo in → see it in every effect at once → tune
// the one you like → send it to the collection.
//
// Layout: ≥1200 px three columns (logo panel · gallery · sticky inspector);
// 760–1199 px logo panel on top (collapsible) over gallery + inspector; phones get
// a collapsible logo panel, a 2-up gallery, the inspector in a bottom Sheet and a
// sticky bottom bar with the selected look and "Use this look".
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, SlidersHorizontal, Upload } from "lucide-react";
import { useStore } from "../../state/store.jsx";
import { useLogoCanvas } from "../../state/useLogoCanvas.js";
import { Button, CanvasImage, Sheet, SpecLabel, cx, navigate, useToast } from "../components/index.js";
import { useLogoUpload } from "../studio/useLogoUpload.js";
import { useGlobalDrop } from "../studio/useGlobalDrop.js";
import { useEffects, useEffectRender, useMediaQuery, useQueueStatus } from "../studio/renderKit.js";
import { LogoPanel } from "../studio/LogoPanel.jsx";
import { Gallery, GALLERY_SIZE, stageStyle } from "../studio/Gallery.jsx";
import {
  Inspector, InspectorActions, InspectorControls, InspectorHead, InspectorStage, useDownload, useInspectorRender,
} from "../studio/Inspector.jsx";
import { useProductMockup } from "../studio/ProductPreview.jsx";
import "./step.css";
import "./studio.css";

export default function Studio() {
  const { state, actions } = useStore();
  const logo = useLogoCanvas();
  const { toast } = useToast();
  const fx = useEffects();
  const isDesktop = useMediaQuery("(min-width: 1200px)");
  const isPhone = useMediaQuery("(max-width: 759px)");
  const [filter, setFilter] = useState("all");
  const [backdrop, setBackdrop] = useState("stage");
  const [view, setView] = useState("art");
  const [sheetOpen, setSheetOpen] = useState(false);

  /* upload: button, drop anywhere, paste */
  const onUploaded = useCallback((r) => {
    const what = r.name === "Pasted logo" ? "your pasted logo" : r.name;
    toast({
      id: "upload",
      tone: "success",
      title: "Logo added",
      body: r.bgRemoved
        ? `We removed the background from ${what} and set your team colors from it. Check both in the logo panel.`
        : `We set your team colors from ${what}. Check them under Team colors.`,
      action: r.bgRemoved ? { label: "Keep background", onClick: () => actions.setLogo({ bgRemoved: false }) } : undefined,
      duration: 8000,
    });
  }, [toast, actions]);
  const upload = useLogoUpload({ onDone: onUploaded });
  const { dragging } = useGlobalDrop({ onFile: upload.handleFile, enabled: !sheetOpen });
  useEffect(() => {
    if (upload.error && !isDesktop) toast({ id: "upload", tone: "danger", title: "That file didn't work", body: upload.error });
  }, [upload.error, isDesktop, toast]);

  /* the selected effect */
  const effect = useMemo(() => fx.effects.find((e) => e.id === state.effect.id) || null, [fx.effects, state.effect.id]);
  const numbers = useMemo(() => {
    const out = {};
    let n = 0;
    for (const e of fx.effects) out[e.id] = e.id === "original" ? 0 : ++n;
    return out;
  }, [fx.effects]);
  const showInspector = !isPhone || sheetOpen;
  const render = useInspectorRender(showInspector ? effect : null, state, logo);
  const mock = useProductMockup({
    art: render.canvas, effectId: effect?.id || null, state, logo,
    enabled: showInspector && !!effect && render.status !== "error",
  });
  const download = useDownload({ effect, state, logo, toast });

  const onSelect = useCallback((id) => {
    if (id !== state.effect.id) actions.setEffect(id);
    if (isPhone) setSheetOpen(true);
  }, [actions, state.effect.id, isPhone]);
  const onToggleFavorite = useCallback((id) => actions.toggleFavorite(id), [actions]);
  // keyboard: jump past the tiles to the selected effect's settings
  const onSkip = useCallback(() => {
    if (isPhone) { setSheetOpen(true); return; }
    document.getElementById("st-insp")?.focus();
  }, [isPhone]);

  // leaving phone layout with the sheet open: close it
  useEffect(() => { if (!isPhone) setSheetOpen(false); }, [isPhone]);


  return (
    <div className={cx("container st-page", isPhone && "is-phone")}>
      <header className="st-head">
        <div className="pg-head st-head__copy">
          <SpecLabel size="lg">Step 01 / 03 · Remix</SpecLabel>
          <h1 className="pg-title st-head__title">Remix your logo</h1>
        </div>
        <p className="st-head__lead">
          Every tile is your logo, rendered live in your team colors. Pick one, tune it, then put it on the kit.
        </p>
      </header>

      <div className="st-layout">
        <div className="st-layout__logo">
          <LogoPanel
            state={state}
            actions={actions}
            logo={logo}
            upload={upload}
            collapsible={!isDesktop}
            onToast={toast}
          />
        </div>

        <div className="st-layout__gallery">
          <Gallery
            effects={fx.effects}
            loadStatus={fx.status}
            selectedId={state.effect.id}
            favorites={state.favorites}
            filter={filter}
            onFilter={setFilter}
            onSelect={onSelect}
            onToggleFavorite={onToggleFavorite}
            logo={logo}
            palette={state.palette}
            selectedParams={state.effect.params}
            seed={state.effect.seed}
            numbers={numbers}
            onSkip={effect ? onSkip : null}
            skipLabel={effect ? `Skip to the ${effect.name} settings` : null}
            noLogo={logo.status === "error" && !logo.canvas}
            onUpload={upload.openPicker}
            status={<RenderStatus loading={fx.status !== "ready"} noLogo={logo.status === "error" && !logo.canvas} total={fx.effects.length} />}
          />
        </div>

        {!isPhone && (
          <div className="st-layout__insp">
            <Inspector
              effect={effect}
              number={effect ? numbers[effect.id] : 0}
              state={state}
              actions={actions}
              render={render}
              mock={mock}
              backdrop={backdrop}
              onBackdrop={setBackdrop}
              view={view}
              onView={setView}
              download={download}
            />
          </div>
        )}
      </div>

      {isPhone && (
        <>
          <PhoneBar effect={effect} state={state} logo={logo} paused={sheetOpen} onOpen={() => setSheetOpen(true)} />
          <Sheet
            open={sheetOpen && !!effect}
            onClose={() => setSheetOpen(false)}
            kicker={effect ? `${effect.method}` : undefined}
            title={effect?.name || "Effect"}
            className="st-sheet"
            footer={<InspectorActions effect={effect} download={download} compact />}
          >
            <InspectorStage effect={effect} render={render} state={state} backdrop={backdrop} onBackdrop={setBackdrop} view={view} onView={setView} mock={mock} />
            <InspectorHead effect={effect} number={effect ? numbers[effect.id] : 0} compact />
            <InspectorControls effect={effect} state={state} actions={actions} />
          </Sheet>
        </>
      )}

      <input {...upload.inputProps} />
      {dragging && <DropOverlay />}
    </div>
  );
}

/** Render-queue readout next to the gallery title (re-renders on its own, not the page). */
function RenderStatus({ loading, noLogo, total }) {
  const { pending } = useQueueStatus();
  return (
    <span className="st-status">
      <span className={cx("st-led", noLogo ? "is-off" : (loading || pending > 0) && "is-busy")} aria-hidden="true" />
      <SpecLabel>{loading ? "Loading effects" : noLogo ? "Waiting for a logo" : pending > 0 ? `Rendering · ${pending} to go` : `${total} looks · live`}</SpecLabel>
    </span>
  );
}

/* ───────────────────────────── phone bottom bar ───────────────────────────── */

function PhoneBar({ effect, state, logo, paused, onOpen }) {
  // same key as the selected gallery tile (shared render); paused under the sheet, where
  // the inspector preview has the queue
  const r = useEffectRender({
    effect, logo, params: state.effect.params, palette: state.palette, seed: state.effect.seed,
    size: GALLERY_SIZE, quality: "preview", priority: 35, debounce: 120, enabled: !paused,
  });
  return (
    <div className="st-bar" role="region" aria-label="Selected look">
      <button type="button" className="st-bar__info" onClick={onOpen} disabled={!effect} aria-label={effect ? `Tune ${effect.name}` : "Loading effect"}>
        <span className={cx("st-bar__thumb", effect && `ml-stage--${effect.stage}`)} style={effect ? stageStyle(effect.stage, state.palette) || undefined : undefined}>
          <CanvasImage canvas={r.canvas} ratio={1} alt="" />
        </span>
        <span className="st-bar__text">
          <span className="st-bar__k">Your look</span>
          <span className="st-bar__name">{effect?.name || "Loading…"}</span>
        </span>
        <span className="st-bar__tune"><SlidersHorizontal aria-hidden="true" /> Tune</span>
      </button>
      <Button variant="team" iconRight={<ArrowRight aria-hidden="true" />} disabled={!effect} onClick={() => navigate("collection")}>
        Use this look
      </Button>
    </div>
  );
}

/* ───────────────────────────── drop overlay ───────────────────────────── */

function DropOverlay() {
  return (
    <div className="st-drop" aria-hidden="true">
      <div className="st-drop__frame">
        <Upload />
        <span className="st-drop__title">Drop your logo</span>
        <SpecLabel>PNG · JPG · SVG · WebP · up to 15 MB</SpecLabel>
      </div>
    </div>
  );
}
