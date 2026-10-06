// Mascot Lab — landing page (#home). Job: show a high-school coach in ten seconds that
// their logo becomes pro-looking team gear without a designer, then get them into the
// Studio. Everything visual on the page is a real render of the team's current logo
// (effects + garment mockups), fed through one landing render queue.
import React, { useState } from "react";
import { ArrowRight, Upload } from "lucide-react";
import { useLogoUpload } from "../studio/useLogoUpload.js";
import { useGlobalDrop } from "../studio/useGlobalDrop.js";
import { Button, Notice, SpecLabel, navigate, useToast } from "../components/index.js";
import { LandingProvider, useLanding } from "../landing/hooks.js";
import { HeroSheet } from "../landing/HeroSheet.jsx";
import { HowItWorks } from "../landing/HowItWorks.jsx";
import { LooksGrid } from "../landing/LooksGrid.jsx";
import { Lookbook } from "../landing/Lookbook.jsx";
import { ForCoaches } from "../landing/ForCoaches.jsx";
import { Faq } from "../landing/Faq.jsx";
import { CtaBand } from "../landing/CtaBand.jsx";
import { HERO } from "../landing/copy.js";
import "./landing.css";

export default function Landing() {
  return (
    <LandingProvider>
      <LandingPage />
    </LandingProvider>
  );
}

function LandingPage() {
  const { state } = useLanding();
  const [origin, setOrigin] = useState("hero");
  const upload = useLogoUpload({ onDone: () => navigate("studio") });
  const { toast } = useToast();
  // a dropped or pasted file can arrive anywhere on the page: report problems in a toast
  const onDrop = (f) => {
    setOrigin("drop");
    upload.handleFile(f).then((r) => {
      if (r && !r.ok && r.error) toast({ tone: "danger", title: "That file didn't work", body: r.error, duration: 8000 });
    });
  };
  const { dragging } = useGlobalDrop({ onFile: onDrop, enabled: !upload.busy });

  const isSample = state.team.isSample;
  const tryLabel = isSample ? `Try it with the ${state.team.mascot || "Bulldogs"}` : "Keep remixing your logo";
  const open = (where) => () => { setOrigin(where); upload.clearError?.(); upload.openPicker(); };
  const heroBusy = upload.busy && origin !== "cta";
  const heroUpload = { ...upload, openPicker: open("hero") };
  const ctaUpload = { ...upload, busy: upload.busy && origin === "cta", openPicker: open("cta") };
  const errorNotice = (where) =>
    upload.error && origin === where ? (
      <Notice tone="danger" title="That file didn't work" className="lp-upload-error" onDismiss={upload.clearError}>
        {upload.error}
      </Notice>
    ) : null;

  return (
    <div className="lp">
      <input {...upload.inputProps} />

      <section className="lp-hero" aria-labelledby="lp-hero-title">
        <div className="container lp-hero__grid">
          <div className="lp-hero__copy">
            <SpecLabel size="lg" className="lp-hero__eyebrow">{HERO.eyebrow}</SpecLabel>
            <h1 id="lp-hero-title" className="lp-hero__title">
              <span>Your logo.</span> <span>Every look.</span> <span className="lp-hero__accent">The whole kit.</span>
            </h1>
            <p className="lp-hero__lead">{HERO.support}</p>
            <div className="lp-hero__ctas">
              <Button size="lg" variant="primary" icon={<Upload aria-hidden="true" />} onClick={heroUpload.openPicker} loading={heroBusy}>
                {heroBusy ? "Reading your logo" : "Upload your logo"}
              </Button>
              <Button size="lg" variant="secondary" iconRight={<ArrowRight aria-hidden="true" />} onClick={() => navigate("studio")}>
                {tryLabel}
              </Button>
            </div>
            {errorNotice("hero")}
            <p className="lp-hero__hint">PNG, JPG, SVG or WebP. We cut out plain backgrounds for you.</p>
            <dl className="lp-hero__facts">
              {HERO.facts.map((f) => (
                <div key={f.k} className="lp-hero__fact">
                  <dt>{f.k}</dt>
                  <dd>{f.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="lp-hero__art">
            <HeroSheet />
          </div>
        </div>
      </section>

      <HowItWorks />
      <LooksGrid />
      <Lookbook />
      <ForCoaches />
      <Faq />
      <CtaBand upload={ctaUpload} onTry={() => navigate("studio")} tryLabel={tryLabel} error={errorNotice("cta")} />

      {dragging && (
        <div className="lp-drop-overlay" aria-hidden="true">
          <div className="lp-drop-overlay__card">
            <Upload />
            <span>Drop your logo to start</span>
            <SpecLabel>PNG, JPG, SVG or WebP · up to 15 MB</SpecLabel>
          </div>
        </div>
      )}
    </div>
  );
}
