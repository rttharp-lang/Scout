// Collection page — one lookbook card: the garment mockup (front or back), its
// spec line and price, a per-card front/back flip and the "in the order" switch.
import React, { useRef } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, CanvasImage, Segmented, SpecLabel, Toggle, cx } from "../components/index.js";
import { PRIORITY, SIZES, mockupInput } from "./render.js";
import { useInView, useMockup } from "./hooks.js";
import { formatPrice } from "./format.js";
import { NoBreakTitle } from "./Title.jsx";

const VIEW_OPTIONS = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
];

export function GarmentCard({ garment, item, product, view, onView, onToggle, onOpen, selected, look, palette, preview, size = SIZES.card, openRef }) {
  const ref = useRef(null);
  const inView = useInView(ref, "240px");
  const enabled = item?.enabled !== false;
  // the bare garment draws while the look is still rendering (its first render is the
  // expensive one, so that time isn't wasted); graphics drop in when the art arrives
  const artReady = !!(look.art || look.clean);
  const other = view === "front" ? "back" : "front";
  const input = mockupInput({ garment, view, item, palette, art: look.art, clean: look.clean, size, preview });
  const otherInput = artReady ? mockupInput({ garment, view: other, item, palette, art: look.art, clean: look.clean, size, preview }) : null;
  const main = useMockup(input, inView ? PRIORITY.visible : PRIORITY.offscreen);
  useMockup(otherInput, PRIORITY.prefetch); // so a flip is instant
  const sideLabel = view === "front" ? "front" : "back";

  return (
    <article
      ref={ref}
      className={cx("cl-card", !enabled && "is-out", selected && "is-selected", item?.custom && "is-custom")}
      aria-label={`${garment.name}${enabled ? "" : " (not in this order)"}`}
    >
      <div className="cl-card__media">
        <button
          type="button"
          ref={openRef}
          className="cl-card__open"
          onClick={onOpen}
          aria-label={`Edit ${garment.name}`}
          aria-expanded={selected || undefined}
        >
          <CanvasImage
            className="cl-stage"
            canvas={main.canvas}
            ratio={1}
            loading={(main.pending || !artReady) && !!main.canvas}
            error={main.error ? "Preview unavailable" : null}
            alt={`${garment.name}, ${sideLabel}`}
          />
          <span className="cl-card__hint" aria-hidden="true"><SlidersHorizontal /> Edit piece</span>
        </button>
        <div className="cl-card__tags">
          <SpecLabel variant="box" className="cl-card__code">{garment.styleCode}</SpecLabel>
          {item?.custom && <SpecLabel variant="team">Edited</SpecLabel>}
        </div>
        <Segmented
          className="cl-card__flip"
          size="sm"
          mono
          label={`${garment.name}: show side`}
          options={VIEW_OPTIONS}
          value={view}
          onChange={onView}
        />
        {!enabled && <span className="cl-card__out" aria-hidden="true">Not in this order</span>}
      </div>
      <div className="cl-card__body">
        <div className="cl-card__title">
          <h3><NoBreakTitle text={garment.name} /></h3>
          {product && <span className="cl-card__price">{formatPrice(product.price)}<small>ea</small></span>}
        </div>
        <p className="cl-card__spec">{garment.spec}</p>
        <div className="cl-card__foot">
          <Toggle checked={enabled} onChange={onToggle} label="In the order" />
          <Button variant="ghost" size="sm" onClick={onOpen} icon={<SlidersHorizontal aria-hidden="true" />} aria-label={`Edit ${garment.name}`}>
            Edit
          </Button>
        </div>
      </div>
    </article>
  );
}

/** Placeholder while the garment registry loads. */
export function GarmentCardSkeleton() {
  return (
    <div className="cl-card cl-card--skeleton" aria-hidden="true">
      <div className="cl-card__media"><CanvasImage className="cl-stage" canvas={null} ratio={1} /></div>
      <div className="cl-card__body">
        <span className="ml-skel ml-skel--text" style={{ width: "55%", height: 22 }} />
        <span className="ml-skel ml-skel--text" style={{ width: "85%" }} />
        <span className="ml-skel ml-skel--text" style={{ width: "40%" }} />
      </div>
    </div>
  );
}
