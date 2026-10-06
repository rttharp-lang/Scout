// Collection page — drop style picker: four large radio cards, each with a small
// live mockup of the same piece built from that style's recipe.
import React, { useMemo, useRef } from "react";
import { Check } from "lucide-react";
import { CanvasImage, cx } from "../components/index.js";
import { DROP_STYLES, buildCollection } from "../../apparel/collection.js";
import { PRIORITY, SIZES, mockupInput } from "./render.js";
import { useMockup } from "./hooks.js";

/** The piece that shows the difference between styles best, among those loaded. */
const HERO_PREF = ["hoodie", "tee", "jersey", "longsleeve", "shorts", "pants"];
export function heroGarment(garments) {
  if (!garments?.length) return null;
  for (const id of HERO_PREF) {
    const g = garments.find((x) => x.id === id);
    if (g) return g;
  }
  return garments[0];
}

function StyleThumb({ garment, item, look, palette, preview }) {
  const ready = !!(garment && item && (look.art || look.clean));
  const input = ready ? mockupInput({ garment, view: "front", item, palette, art: look.art, clean: look.clean, size: SIZES.style, preview, shadow: false }) : null;
  const m = useMockup(input, PRIORITY.styles);
  return <CanvasImage className="cl-stage cl-style__thumb" canvas={m.canvas} ratio={1} loading={m.pending && !!m.canvas} alt="" />;
}

export function DropStylePicker({ value, onChange, garments, look, palette, preview, effectStage = null }) {
  const refs = useRef([]);
  const hero = heroGarment(garments);
  const paletteKey = JSON.stringify(palette);
  // same build as the real collection (a dark-stage look moves light pieces onto dark bases)
  const recipes = useMemo(
    () => Object.fromEntries(DROP_STYLES.map((s) => [s.id, buildCollection(s.id, palette, { effectStage }).items])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paletteKey, effectStage],
  );
  const cur = Math.max(0, DROP_STYLES.findIndex((s) => s.id === value));
  const move = (i, dir) => {
    const n = (i + dir + DROP_STYLES.length) % DROP_STYLES.length;
    onChange(DROP_STYLES[n].id);
    refs.current[n]?.focus();
  };

  return (
    <div className="cl-styles" role="radiogroup" aria-labelledby="cl-styles-h">
      {DROP_STYLES.map((s, i) => {
        const on = i === cur;
        return (
          <button
            key={s.id}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={cx("cl-style", on && "is-on")}
            onClick={() => onChange(s.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(i, 1); }
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(i, -1); }
            }}
          >
            <StyleThumb garment={hero} item={hero ? recipes[s.id]?.[hero.id] : null} look={look} palette={palette} preview={preview} />
            <span className="cl-style__text">
              <span className="cl-style__name">
                {s.name}
                {on && <span className="cl-style__check" aria-hidden="true"><Check /></span>}
              </span>
              <span className="cl-style__blurb">{s.blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
