// The hero's proof sheet: the team's logo run through several real effects, cycling
// on a big stage, next to a real garment wearing the current look. One motion moment
// (the squeegee wipe between looks); paused for reduced motion, off-screen, hidden
// tabs, hover/focus, or by the pause button.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Pause, Play } from "lucide-react";
import { Button, CanvasImage, IconButton, RegMark, SpecLabel, Swatch, cx, navigate } from "../components/index.js";
import { getDropStyle } from "../../apparel/collection.js";
import { useArt, useInView, useJobs, useLanding, useMockups, usePageVisible } from "./hooks.js";
import { PRIORITY, artJob, artKey, effectView, isCanvas, letteringFor, mockJob, mockKey } from "./renders.js";
import { pickCycle, pickHeroGarment } from "./picks.js";
import { WipeImage } from "./WipeImage.jsx";

const DWELL = 3200; // ms each look holds before the next one is pulled

export function HeroSheet() {
  const { state, actions, logo, palette, effects, garments, reduced } = useLanding();
  const rootRef = useRef(null);
  const inView = useInView(rootRef, { rootMargin: "0px", once: false });
  const pageVisible = usePageVisible();
  const [userPaused, setUserPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [selId, setSelId] = useState(null);

  const cycle = useMemo(() => pickCycle(effects, state.effect.id), [effects, state.effect.id]);
  const original = effects?.find((e) => e.id === "original") || null;
  const garment = useMemo(() => pickHeroGarment(garments, state.collection), [garments, state.collection]);
  const item = garment ? state.collection.items[garment.id] : null;
  const view = effectView(item);
  const drop = getDropStyle(state.collection.dropStyle);

  const own = (e) => (e.id === state.effect.id ? state.effect.params : {});
  const arts = useArt(
    cycle.map((e, i) => ({ effect: e, params: own(e), seed: state.effect.seed, priority: i === 0 ? PRIORITY.heroArt : PRIORITY.heroRest - i })),
  );
  const [clean] = useArt([original && { effect: original, priority: PRIORITY.clean }]);
  // First paint: the clean logo on the stage and on the garment, so the first remix
  // wipes over the coach's own logo. One job (clean render + garment pass) so it is
  // queued together with the art jobs and runs ahead of them.
  const lettering = useMemo(() => letteringFor(state.roster), [state.roster]);
  const cleanK = original && logo.canvas ? artKey(original.id, logo, palette) : null;
  const cleanMockK = cleanK && garment && item ? mockKey(garment.id, view, item, palette, cleanK, cleanK, lettering) : null;
  const getCleanMock = useJobs(
    [cleanMockK && {
      key: cleanMockK,
      priority: PRIORITY.cleanMock,
      run: async () => {
        const c = await artJob(original, logo, palette)();
        return mockJob(garment, view, item, palette, c, c, lettering)();
      },
    }],
    !!logo.canvas,
  );
  const cleanMock = { result: getCleanMock(cleanMockK) };
  const mocks = useMockups(
    garment ? arts.map((a, i) => ({ garment, view, item, art: a, clean: clean || null, priority: i === 0 ? PRIORITY.heroMock : PRIORITY.heroRest - 8 - i })) : [],
  );

  const curIdx = Math.max(0, cycle.findIndex((e) => e.id === selId));
  const cur = cycle[curIdx] || null;
  const frameReady = (i) => isCanvas(arts[i]?.result) && (!garment || isCanvas(mocks[i]?.result) || mocks[i]?.result instanceof Error);
  const readySig = cycle.map((_, i) => (frameReady(i) ? 1 : 0)).join("");

  const canCycle = cycle.length > 1 && !reduced;
  const paused = userPaused || hover || focusIn || !inView || !pageVisible;

  // advance to the next ready look after DWELL ms
  useEffect(() => {
    if (!canCycle || paused || !frameReady(curIdx)) return;
    const t = setTimeout(() => {
      for (let s = 1; s < cycle.length; s++) {
        const j = (curIdx + s) % cycle.length;
        if (frameReady(j)) { setSelId(cycle[j].id); return; }
      }
    }, DWELL);
    return () => clearTimeout(t);
    // readySig covers frameReady changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCycle, paused, curIdx, readySig, cycle]);

  const artNow = arts[curIdx]?.result;
  const mockNow = mocks[curIdx]?.result;
  const cleanArt = isCanvas(clean?.result) ? clean.result : null;
  const stageArt = isCanvas(artNow) ? artNow : cleanArt;
  const stageMock = isCanvas(mockNow) ? mockNow : isCanvas(cleanMock?.result) ? cleanMock.result : null;
  const teamName = `${state.team.school} ${state.team.mascot}`.trim();
  const total = String(cycle.length).padStart(2, "0");
  const loadingEffects = effects === null || (logo.status !== "ready" && !logo.canvas);

  const use = (e) => { actions.setEffect(e.id); navigate("studio"); };

  return (
    <section
      ref={rootRef}
      className="lp-sheet crop-marks"
      aria-label="Live preview of your logo"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocusIn(false); }}
    >
      <header className="lp-sheet__bar">
        <div className="lp-sheet__id">
          <RegMark size={14} />
          <SpecLabel k="Proof" v={teamName || "Your team"} />
          <span className="lp-sheet__inks" role="img" aria-label={`Team inks ${palette.primary}, ${palette.secondary}, ${palette.accent}`}>
            <SpecLabel>Inks</SpecLabel>
            {[palette.primary, palette.secondary, palette.accent].map((c, i) => <Swatch key={i} color={c} size="xs" aria-hidden="true" />)}
          </span>
        </div>
        <div className="lp-sheet__tools">
          <SpecLabel variant={state.team.isSample ? "warning" : "box"}>{state.team.isSample ? "Sample logo" : "Your logo"}</SpecLabel>
          {canCycle && (
            <IconButton
              size="sm"
              label={userPaused ? "Play the looks" : "Pause the looks"}
              icon={userPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              onClick={() => setUserPaused((p) => !p)}
            />
          )}
        </div>
      </header>

      <div className="lp-sheet__panels">
        <div className="lp-sheet__panel">
          <WipeImage
            canvas={stageArt}
            stage={isCanvas(artNow) ? cur?.stage || "paper" : "paper"}
            loading={!isCanvas(artNow) && !!stageArt && !(artNow instanceof Error)}
            alt={cur ? `${teamName} logo in the ${cur.name} effect` : "Loading effects"}
            error={artNow instanceof Error ? "Couldn't render this look" : logo.status === "error" && !logo.canvas ? "Couldn't open this logo. Upload it again." : null}
          />
          <div className="lp-sheet__cap">
            <SpecLabel>{cur ? `${String(curIdx + 1).padStart(2, "0")} / ${total} · ${cur.method || "Screen print"}` : "Loading looks"}</SpecLabel>
            <h3 className="lp-sheet__name" aria-live={userPaused || !canCycle ? "polite" : "off"}>{cur ? cur.name : " "}</h3>
            {cur && (
              <Button size="sm" variant="ghost" className="lp-sheet__use" iconRight={<ArrowRight aria-hidden="true" />} onClick={() => use(cur)}>
                Use this look
              </Button>
            )}
          </div>
        </div>

        <div className="lp-sheet__panel lp-sheet__panel--garment">
          <WipeImage
            canvas={stageMock}
            stage="none"
            loading={!isCanvas(mockNow) && !!stageMock && !(mockNow instanceof Error)}
            alt={garment && cur ? `${garment.name} with the ${cur.name} graphic` : "Loading garment"}
            error={mockNow instanceof Error ? "Couldn't draw this piece" : null}
          />
          <div className="lp-sheet__cap">
            <SpecLabel>{garment ? `${garment.styleCode} · ${view === "back" ? "Back" : "Front"}` : garments === null ? "Loading kit" : "Kit coming soon"}</SpecLabel>
            <h3 className="lp-sheet__name">{garment ? garment.name : " "}</h3>
            {drop && <SpecLabel className="lp-sheet__drop">{drop.name} drop</SpecLabel>}
          </div>
        </div>
      </div>

      <div className="lp-sheet__strip">
        <div className="lp-sheet__in">
          <CanvasImage canvas={logo.canvas} stage="paper" ratio={1} padding={0.08} alt={`${teamName} logo`} />
          <SpecLabel className="lp-sheet__inlabel">In</SpecLabel>
        </div>
        <ArrowRight className="lp-sheet__arrow" aria-hidden="true" />
        <div className="lp-sheet__tiles" role="group" aria-label="Looks">
          {(loadingEffects ? Array.from({ length: 6 }, () => null) : cycle).map((e, i) =>
            e ? (
              <button
                key={e.id}
                type="button"
                className={cx("lp-sheet__tile", i === curIdx && "is-current")}
                aria-pressed={i === curIdx}
                aria-label={`Show ${e.name}`}
                title={e.name}
                onClick={() => setSelId(e.id)}
              >
                <CanvasImage canvas={isCanvas(arts[i]?.result) ? arts[i].result : null} stage={e.stage} ratio={1} alt="" />
                {i === curIdx && canCycle && (
                  <span
                    key={`p-${e.id}-${paused ? "p" : "r"}-${frameReady(i) ? 1 : 0}`}
                    className={cx("lp-sheet__progress", (paused || !frameReady(i)) && "is-paused")}
                    style={{ animationDuration: `${DWELL}ms` }}
                    aria-hidden="true"
                  />
                )}
              </button>
            ) : (
              <span key={i} className="lp-sheet__tile is-skeleton" aria-hidden="true">
                <CanvasImage canvas={null} ratio={1} />
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

export default HeroSheet;
