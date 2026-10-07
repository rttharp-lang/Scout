// Mascot Lab — Studio (#studio). Logo in → see it in every look at once → tune the one
// you like → send it to the collection.
//
// Layout (DESIGN.md "Studio"): ≥1360 px three columns — the logo sidebar, the look
// gallery and the sticky inspector (large preview + controls); 721–1359 px the logo
// panel folds into a team bar over gallery + inspector; phones (≤720 px) get the team
// bar, a 2-up gallery, the inspector in a bottom Sheet and a sticky bottom bar with the
// selected look and "Use this look".
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronUp, Upload } from "lucide-react";
import { useStore } from "../../state/store.jsx";
import { useLogoCanvas } from "../../state/useLogoCanvas.js";
import { Button, CanvasImage, Sheet, SpecLabel, cx, navigate, useToast } from "../components/index.js";
import { useLogoUpload } from "../studio/useLogoUpload.js";
import { useGlobalDrop } from "../studio/useGlobalDrop.js";
import { useEffects, useEffectRender, useMediaQuery } from "../studio/renderKit.js";
import { LogoPanel } from "../studio/LogoPanel.jsx";
import { Gallery, GALLERY_SIZE, catLabel, stageStyle } from "../studio/Gallery.jsx";
import {
  Inspector, InspectorActions, InspectorControls, InspectorHead, InspectorStage, useDownload, useInspectorRender,
} from "../studio/Inspector.jsx";
import { useProductMockup } from "../studio/ProductPreview.jsx";
import "./step.css";
import "./studio.css";

// the gallery filter and search survive a trip to the collection and back (this session)
const kept = { filter: "all", query: "" };

export default function Studio() {
  const { state, actions } = useStore();
  const logo = useLogoCanvas();
  const { toast } = useToast();
  const fx = useEffects();
  const isDesktop = useMediaQuery("(min-width: 1360px)");
  const isPhone = useMediaQuery("(max-width: 720px)");
  const [filter, setFilterState] = useState(kept.filter);
  const [query, setQueryState] = useState(kept.query);
  const setFilter = useCallback((f) => { kept.filter = f; setFilterState(f); }, []);
  const setQuery = useCallback((q) => { kept.query = q; setQueryState(q); }, []);
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

  /* the selected look */
  const effect = useMemo(() => fx.effects.find((e) => e.id === state.effect.id) || null, [fx.effects, state.effect.id]);
  // a filter that no longer exists (a category whose looks didn't load) falls back to All
  useEffect(() => {
    if (fx.status === "ready" && filter !== "all" && filter !== "fav" && !fx.effects.some((e) => e.category === filter)) setFilter("all");
  }, [fx.status, fx.effects, filter, setFilter]);
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
  // keyboard: jump past the tiles to the selected look's settings
  const onSkip = useCallback(() => {
    if (isPhone) { setSheetOpen(true); return; }
    document.getElementById("st-insp")?.focus();
  }, [isPhone]);

  // leaving the phone layout with the sheet open: close it
  useEffect(() => { if (!isPhone) setSheetOpen(false); }, [isPhone]);

  const noLogo = logo.status === "error" && !logo.canvas;
  const favorite = !!effect && state.favorites.includes(effect.id);

  return (
    <div className={cx("container st-page", isPhone && "is-phone")}>
      <header className="st-head">
        <div className="pg-head">
          <SpecLabel size="lg">Step 1 of 3</SpecLabel>
          <h1 className="pg-title">Remix your logo</h1>
        </div>
        <p className="t-lead st-head__lead">
          Every tile is your logo, rendered live in your team colors. Pick a look, tune it, then put it on the kit.
        </p>
      </header>

      <div className={cx("st-layout", isDesktop ? "st-layout--3" : "st-layout--2")}>
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
            query={query}
            onQuery={setQuery}
            onSelect={onSelect}
            onToggleFavorite={onToggleFavorite}
            logo={logo}
            palette={state.palette}
            selectedParams={state.effect.params}
            seed={state.effect.seed}
            onSkip={effect ? onSkip : null}
            skipLabel={effect ? `Skip to the ${effect.name} settings` : null}
            noLogo={noLogo}
            onUpload={upload.openPicker}
          />
        </div>

        {!isPhone && (
          <div className="st-layout__insp">
            <Inspector
              effect={effect}
              state={state}
              actions={actions}
              render={render}
              mock={mock}
              backdrop={backdrop}
              onBackdrop={setBackdrop}
              view={view}
              onView={setView}
              download={download}
              onToggleFavorite={onToggleFavorite}
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
            kicker={effect ? `${catLabel(effect.category)} · ${effect.method}` : undefined}
            title={effect?.name || "Look"}
            className="st-sheet"
            footer={<InspectorActions effect={effect} download={download} compact />}
          >
            <InspectorStage effect={effect} render={render} state={state} actions={actions} backdrop={backdrop} onBackdrop={setBackdrop} view={view} onView={setView} mock={mock} />
            <InspectorHead effect={effect} favorite={favorite} compact />
            <InspectorControls effect={effect} state={state} actions={actions} />
          </Sheet>
        </>
      )}

      <input {...upload.inputProps} />
      {dragging && <DropOverlay />}
    </div>
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
    <div className="ml-sticky-bar st-bar" role="region" aria-label="Selected look">
      <button type="button" className="st-bar__info" onClick={onOpen} disabled={!effect} aria-label={effect ? `Tune ${effect.name}` : "Loading look"}>
        <span className={cx("st-bar__thumb", effect && `ml-stage--${effect.stage}`)} style={effect ? stageStyle(effect.stage, state.palette) || undefined : undefined}>
          <CanvasImage canvas={r.canvas} ratio={1} alt="" />
        </span>
        <span className="st-bar__text">
          <span className="st-bar__k">Your look</span>
          <span className="st-bar__name">{effect?.name || "Loading…"}</span>
        </span>
        <ChevronUp aria-hidden="true" className="st-bar__chev" />
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
      <div className="st-drop__card">
        <span className="st-drop__icon"><Upload /></span>
        <span className="st-drop__title">Drop your logo</span>
        <span className="st-drop__hint">PNG, JPG, SVG or WebP up to 15 MB</span>
      </div>
    </div>
  );
}
