import React, { useState } from "react";

const Lang = ({ title, items, className }) => (items?.length ? (
  <div className={className}>
    <h3 className="field-label" style={{ marginBottom: 6 }}>{title}</h3>
    <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
  </div>
) : null);

// The art-direction brief: concept + the macro view on the left, palette and
// product language on the right. Collapsible on small screens so the images
// arrive above the fold.
export default function BriefPanel({ brief, onCopyHex }) {
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 760);
  if (!brief) return null;
  return (
    <section className="brief" aria-label="Art-direction brief">
      <div className="brief-card">
        <h3>Concept</h3>
        <p className="brief-concept">{brief.concept}</p>
        {open && (
          <div className="macro">
            {brief.macro?.shift && <div><b>The shift{brief.macro.stage ? ` · ${brief.macro.stage}` : ""}</b><p>{brief.macro.shift}</p></div>}
            {brief.macro?.drivers?.length > 0 && (
              <div>
                <b>Drivers</b>
                <ul className="signal-list">
                  {brief.macro.drivers.map((d, i) => <li key={i}><strong>{d.pillar}.</strong> {d.signal}{d.implication ? <> <span className="arrow">→</span> {d.implication}</> : null}</li>)}
                </ul>
              </div>
            )}
            {(brief.macro?.consumer?.name || brief.macro?.consumer?.mindset) && (
              <div><b>The consumer{brief.macro.consumer.name ? ` · ${brief.macro.consumer.name}` : ""}</b><p>{brief.macro.consumer.mindset}</p></div>
            )}
            {brief.macro?.confidence && <p className="confidence">{brief.macro.confidence}</p>}
          </div>
        )}
        <button type="button" className="more-toggle brief-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Hide the macro view & product language" : "Show the macro view & product language"}
        </button>
      </div>
      <div className="brief-card">
        <h3>Palette</h3>
        <div className="palette">
          {(brief.palette || []).map((c) => (
            <button key={c.hex + c.name} type="button" className="swatch" onClick={() => onCopyHex?.(c)} title={`Copy ${c.hex}`}>
              <span className="swatch-chip" style={{ background: c.hex }} />
              <span className="swatch-name">{c.name}</span>
              <span className="swatch-hex">{c.hex} <span className="swatch-role">· {c.role}</span></span>
              {c.source && <span className="swatch-source">{c.source}</span>}
            </button>
          ))}
        </div>
        {open && (
          <div className="lang-grid">
            <Lang title="Materials & finishes" items={brief.materials} />
            <Lang title="Silhouettes" items={brief.silhouettes} />
            <Lang title="Details & trims" items={brief.details} />
            <Lang title="Graphics" items={brief.graphics} />
            <Lang title="References" items={brief.references} />
            <Lang title="Avoid" items={brief.avoid} className="avoid" />
          </div>
        )}
      </div>
    </section>
  );
}
