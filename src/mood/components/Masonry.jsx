import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

// Pinterest-style masonry (the Gestalt approach): every item is placed, in
// rank order, into the left-most of the shortest columns using its known
// aspect ratio, then absolutely positioned. DOM / tab / screen-reader order is
// the curated rank order, nothing shifts as images load, and appending items
// never moves the ones already placed.
export function gutterFor(width) {
  return width < 480 ? 8 : width < 768 ? 12 : 16;
}
export function columnCount(width, gutter = gutterFor(width)) {
  if (!width) return 2;
  if (width < 600) return 2;
  return Math.max(3, Math.min(8, Math.floor((width + gutter) / (220 + gutter))));
}

// Columns within TIE px of the shortest count as tied → the left-most wins,
// which keeps visual order close to rank order.
const TIE = 16;
export function layoutMasonry(ratios, width) {
  const gutter = gutterFor(width);
  const cols = columnCount(width, gutter);
  const colW = width ? (width - (cols - 1) * gutter) / cols : 0;
  const heights = new Array(cols).fill(0);
  const boxes = ratios.map((r) => {
    const h = Math.round(colW * r);
    const min = Math.min(...heights);
    const c = heights.findIndex((v) => v <= min + TIE);
    const box = { x: Math.round(c * (colW + gutter)), y: heights[c], w: Math.floor(colW), h };
    heights[c] += h + gutter;
    return box;
  });
  return { boxes, height: Math.max(0, Math.max(...heights) - gutter), cols };
}

export default function Masonry({ items, getKey, getRatio, renderItem, label }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const ro = new ResizeObserver((entries) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(Math.round(entries[0].contentRect.width)));
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, []);

  const ratios = items.map(getRatio);
  const key = ratios.join(",");
  const { boxes, height, cols } = useMemo(() => layoutMasonry(ratios, width), [key, width]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ul className="masonry" ref={ref} style={{ height }} aria-label={label} data-cols={cols}>
      {width > 0 && items.map((it, i) => {
        const b = boxes[i];
        return (
          <li key={getKey(it)} className="masonry-item" style={{ width: b.w, height: b.h, transform: `translate(${b.x}px, ${b.y}px)` }}>
            {renderItem(it, i)}
          </li>
        );
      })}
    </ul>
  );
}
