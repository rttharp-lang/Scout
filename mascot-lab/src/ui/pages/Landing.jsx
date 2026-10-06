// STUB — the landing page is built in a later phase.
import React from "react";
import { ArrowRight, Upload } from "lucide-react";
import { useStore } from "../../state/store.jsx";
import { useLogoCanvas } from "../../state/useLogoCanvas.js";
import { Button, CanvasImage, SpecLabel } from "../components/index.js";
import { COPY, PITCH } from "../../brand.js";
import "./stub.css";

export default function Landing() {
  const { state } = useStore();
  const logo = useLogoCanvas();
  const teamName = `${state.team.school} ${state.team.mascot}`;
  return (
    <section className="container ml-hero">
      <div className="ml-hero__copy">
        <SpecLabel size="lg">Team apparel · no designer needed</SpecLabel>
        <h1 className="ml-hero__title">Your logo.<br />Every look.<br /><em>The whole kit.</em></h1>
        <p className="lead">{PITCH}</p>
        <div className="ml-hero__ctas">
          <Button size="lg" href="#studio" iconRight={<ArrowRight aria-hidden="true" />}>Remix the sample</Button>
          <Button size="lg" variant="secondary" href="#studio" icon={<Upload aria-hidden="true" />}>Upload your logo</Button>
        </div>
        <ol className="ml-hero__steps" role="list">
          <li><SpecLabel>01</SpecLabel><strong>Remix</strong><span>Halftone, graffiti, chrome and more.</span></li>
          <li><SpecLabel>02</SpecLabel><strong>Collection</strong><span>Jersey, shorts, hoodie, pants.</span></li>
          <li><SpecLabel>03</SpecLabel><strong>Order</strong><span>Sizes for the roster, one request.</span></li>
        </ol>
      </div>
      <figure className="ml-hero__art">
        <div className="crop-marks">
          <CanvasImage canvas={logo.canvas} ratio={1} stage="paper" padding={0.14} alt={`${COPY.sampleLogo}: ${teamName}`} loading={logo.status === "loading"} />
        </div>
        <figcaption className="ml-hero__caption">
          <SpecLabel k={state.team.isSample ? COPY.sampleLogo : "Your logo"} v={teamName} />
          <SpecLabel>{state.palette.primary} · {state.palette.secondary}</SpecLabel>
        </figcaption>
      </figure>
    </section>
  );
}
