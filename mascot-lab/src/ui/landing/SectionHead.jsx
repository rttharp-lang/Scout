import React from "react";
import { SpecLabel, cx } from "../components/index.js";

/**
 * SectionHead — spec-sheet section header: heavy rule, "NN / Kicker" mono line with an
 * optional right-hand spec, then the display title and a lead paragraph beside it.
 */
export function SectionHead({ n, kicker, title, lead, aside, id, className, children }) {
  return (
    <header className={cx("lp-head", className)}>
      <div className="lp-head__rule">
        <SpecLabel className="lp-head__n">{n}</SpecLabel>
        <SpecLabel className="lp-head__kicker">{kicker}</SpecLabel>
        {aside && <SpecLabel className="lp-head__aside">{aside}</SpecLabel>}
      </div>
      <div className="lp-head__main">
        <h2 id={id} className="lp-head__title">{title}</h2>
        {(lead || children) && (
          <div className="lp-head__side">
            {lead && <p className="lp-head__lead">{lead}</p>}
            {children}
          </div>
        )}
      </div>
    </header>
  );
}

export default SectionHead;
