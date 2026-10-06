// Placeholder layout for pages another build phase fills in. Title, one line on
// what the page will hold, and step navigation — enough to click through the flow.
import React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button, RegMark, SpecLabel } from "../components/index.js";
import "./stub.css";

export default function PageStub({ eyebrow, title, description, placeholder, back, next, children }) {
  return (
    <section className="ml-stub container">
      <header className="ml-stub__head">
        {eyebrow && <SpecLabel size="lg">{eyebrow}</SpecLabel>}
        <h1 className="ml-stub__title">{title}</h1>
        {description && <p className="lead">{description}</p>}
      </header>
      {children || (
        <div className="ml-stub__panel crop-marks">
          <RegMark size={28} />
          <SpecLabel>{placeholder || "In production"}</SpecLabel>
        </div>
      )}
      {(back || next) && (
        <nav className="ml-stub__nav" aria-label="Step navigation">
          {back ? (
            <Button variant="secondary" href={back.href} icon={<ArrowLeft aria-hidden="true" />}>{back.label}</Button>
          ) : <span />}
          {next && <Button size="lg" href={next.href} iconRight={<ArrowRight aria-hidden="true" />}>{next.label}</Button>}
        </nav>
      )}
    </section>
  );
}
