// Closing call to action: team-colour panel + the current look printed oversized,
// cropped hard by the edge (the statement-drop move, applied to the page).
import React, { useRef } from "react";
import { ArrowRight, Upload } from "lucide-react";
import { Button, CanvasImage, SpecLabel } from "../components/index.js";
import { useArt, useInView, useLanding } from "./hooks.js";
import { PRIORITY, isCanvas } from "./renders.js";
import { currentLook } from "./picks.js";
import { FACTS } from "./copy.js";

const CTA_ART_SIZE = 512; // shown at ~600 px: the 384 gallery render would go soft

export function CtaBand({ upload, onTry, tryLabel, error = null }) {
  const { state, effects } = useLanding();
  const ref = useRef(null);
  const inView = useInView(ref, { rootMargin: "400px 0px" });
  const look = currentLook(effects, state.effect);
  const [art] = useArt([look.effect && { effect: look.effect, params: look.params, seed: look.seed, size: CTA_ART_SIZE, priority: PRIORITY.cta }], inView);
  return (
    <section className="lp-cta" aria-labelledby="lp-cta-title" ref={ref}>
      <div className="container">
        <div className="lp-cta__band">
          <div className="lp-cta__copy">
            <SpecLabel className="lp-cta__kicker">Start here</SpecLabel>
            <h2 id="lp-cta-title" className="lp-cta__title">Your logo is all it takes.</h2>
            <p className="lp-cta__lead">Upload it now and see your team's kit in a few seconds. Nothing is sent to us until you send an order request.</p>
            <div className="lp-cta__actions">
              <Button size="lg" variant="primary" className="lp-cta__primary" icon={<Upload aria-hidden="true" />} onClick={upload.openPicker} loading={upload.busy}>
                Upload your logo
              </Button>
              <Button size="lg" variant="ghost" className="lp-cta__secondary" iconRight={<ArrowRight aria-hidden="true" />} onClick={onTry}>
                {tryLabel}
              </Button>
            </div>
            {error}
            <div className="lp-cta__facts">
              <SpecLabel>Min. {FACTS.min}</SpecLabel>
              <SpecLabel>Proof in {FACTS.proof}</SpecLabel>
              <SpecLabel>Up to {FACTS.topOff} off</SpecLabel>
            </div>
          </div>
          <div className={`lp-cta__art ml-stage--${look.effect?.stage || "dark"}`} aria-hidden="true">
            <CanvasImage canvas={isCanvas(art?.result) ? art.result : null} stage="none" ratio={1} alt="" />
          </div>
        </div>
      </div>
    </section>
  );
}

export default CtaBand;
