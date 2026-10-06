import React, { useEffect, useRef, useState } from "react";
import { CanvasImage, cx } from "../components/index.js";

/**
 * WipeImage — a CanvasImage that, when its canvas changes, pulls the new image in
 * over the old one left to right with a squeegee blade (the hero's one motion moment).
 * With animate=false (or reduced motion: the global rule shortens it to 1 ms) it swaps.
 */
export function WipeImage({ canvas, stage = "none", alt = "", animate = true, padding = 0, loading = false, error = null, className }) {
  const seq = useRef(0);
  const [layers, setLayers] = useState(() => (canvas ? [{ id: 0, canvas, stage, entering: false }] : []));

  useEffect(() => {
    if (!canvas) return;
    setLayers((ls) => {
      const top = ls[ls.length - 1];
      if (top && top.canvas === canvas && top.stage === stage) return ls;
      const id = ++seq.current;
      return animate && top ? [top, { id, canvas, stage, entering: true }] : [{ id, canvas, stage, entering: false }];
    });
  }, [canvas, stage, animate]);

  const settle = (id) => setLayers((ls) => ls.filter((l) => l.id >= id).map((l) => (l.id === id ? { ...l, entering: false } : l)));
  const entering = layers.find((l) => l.entering);

  return (
    <div className={cx("lp-wipe", className)}>
      {layers.length ? (
        layers.map((l, i) => (
          <div key={l.id} className={cx("lp-wipe__layer", l.entering && "is-entering")} onAnimationEnd={l.entering ? () => settle(l.id) : undefined} aria-hidden={i < layers.length - 1 || undefined}>
            <CanvasImage canvas={l.canvas} stage={l.stage} ratio={1} padding={padding} alt={i === layers.length - 1 ? alt : ""} loading={loading && i === layers.length - 1} />
          </div>
        ))
      ) : (
        <div className="lp-wipe__layer">
          <CanvasImage canvas={null} stage={stage} ratio={1} error={error} alt={alt} />
        </div>
      )}
      {entering && <span key={`blade-${entering.id}`} className="lp-wipe__blade" aria-hidden="true" />}
    </div>
  );
}

export default WipeImage;
