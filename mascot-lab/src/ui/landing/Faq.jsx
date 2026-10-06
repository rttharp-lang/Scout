// FAQ: native <details>/<summary> disclosure (keyboard + screen reader support for free).
import React from "react";
import { Plus } from "lucide-react";
import { CONTACT_EMAIL, SUPPORT_HOURS } from "../../brand.js";
import { SpecLabel } from "../components/index.js";
import { SectionHead } from "./SectionHead.jsx";
import { FAQ } from "./copy.js";

export function Faq() {
  return (
    <section className="lp-section lp-faq" aria-labelledby="lp-faq-title">
      <div className="container lp-faq__grid">
        <div className="lp-faq__intro">
          <SectionHead n="05" kicker="Questions" id="lp-faq-title" title="Straight answers." />
          <div className="lp-faq__contact">
            <p>Didn't see your question? Email the order desk.</p>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            <SpecLabel>{SUPPORT_HOURS}</SpecLabel>
          </div>
        </div>
        <div className="lp-faq__list">
          {FAQ.map((f, i) => (
            <details key={f.q} className="lp-qa">
              <summary className="lp-qa__q">
                <SpecLabel className="lp-qa__n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</SpecLabel>
                <span className="lp-qa__text">{f.q}</span>
                <span className="lp-qa__icon" aria-hidden="true"><Plus /></span>
              </summary>
              <div className="lp-qa__a"><p>{f.a}</p></div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Faq;
