// Placeholder layout for pages another build phase fills in. Title, one line on
// what the page will hold, and step navigation — enough to click through the flow.
import React from "react";
import { ArrowLeft, ArrowRight, Hourglass } from "lucide-react";
import { Button, SpecLabel } from "../components/index.js";
import "./step.css";
import "./stub.css";

export default function PageStub({ eyebrow, title, description, placeholder, back, next, children }) {
  return (
    <section className="ml-stub container">
      <header className="ml-stub__head pg-head">
        {eyebrow && <SpecLabel size="lg">{eyebrow}</SpecLabel>}
        <h1 className="ml-stub__title pg-title">{title}</h1>
        {description && <p className="t-lead">{description}</p>}
      </header>
      {children || (
        <div className="ml-stub__panel ml-empty">
          <span className="ml-empty__icon"><Hourglass aria-hidden="true" /></span>
          <p className="ml-empty__title">{placeholder || "In production"}</p>
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
