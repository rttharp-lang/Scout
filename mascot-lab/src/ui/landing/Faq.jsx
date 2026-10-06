// FAQ: native <details>/<summary> disclosures (keyboard + screen reader support for free),
// laid out like the other sections: the head (with the order desk's address as selectable
// text + a copy button, since mailto: links can fail inside the Artifact frame), then the
// questions in two independent columns on wide screens, one column below 1000 px.
import React from "react";
import { Plus } from "lucide-react";
import { CONTACT_EMAIL, SUPPORT_HOURS } from "../../brand.js";
import { SpecLabel } from "../components/index.js";
import { CopyText } from "../order/CopyText.jsx";
import { SectionHead } from "./SectionHead.jsx";
import { FAQ } from "./copy.js";

export function Faq() {
  const half = Math.ceil(FAQ.length / 2);
  const cols = [FAQ.slice(0, half), FAQ.slice(half)].filter((c) => c.length);
  return (
    <section className="lp-section lp-faq" aria-labelledby="lp-faq-title">
      <div className="container">
        <SectionHead
          n="05"
          kicker="Questions"
          aside="Files · Proofs · Sizes · Timing · Cost"
          id="lp-faq-title"
          title="Straight answers."
        >
          <div className="lp-faq__contact">
            <p>Didn't see your question? Email the order desk.</p>
            <CopyText text={CONTACT_EMAIL} label="Copy address" className="lp-faq__email" />
            <SpecLabel>{SUPPORT_HOURS}</SpecLabel>
          </div>
        </SectionHead>
        <div className="lp-faq__cols">
          {cols.map((col, c) => (
            <div key={c} className="lp-faq__list">
              {col.map((f, i) => (
                <details key={f.q} className="lp-qa">
                  <summary className="lp-qa__q">
                    <SpecLabel className="lp-qa__n" aria-hidden="true">{String(c * half + i + 1).padStart(2, "0")}</SpecLabel>
                    <span className="lp-qa__text">{f.q}</span>
                    <span className="lp-qa__icon" aria-hidden="true"><Plus /></span>
                  </summary>
                  <div className="lp-qa__a"><p>{f.a}</p></div>
                </details>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Faq;
