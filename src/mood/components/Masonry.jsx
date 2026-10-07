import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

// Pinterest-style masonry: items flow left-to-right into the currently
// shortest column, using each image's known aspect ratio so nothing shifts as
// images load. Greedy placement is deterministic, so appending items ("load
// more") never reshuffles what's already on screen.
const GUTTER = { phone: 12, wide: 16 };

export function columnCount(width) {
  if (!width) return 2;
  if (width < 600) return 2;
  const g = width >= 900 ? GUTTER.wide : GUTTER.phone;
  return Math.max(3, Math.min(7, Math.floor((width + g) / (220 + g))));
}

export default function Masonry({ items, getKey, getRatio, renderItem, extraHeight = 0 }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = columnCount(width);
  const columns = useMemo(() => {
    const heights = new Array(cols).fill(0);
    const out = Array.from({ length: cols }, () => []);
    items.forEach((it, i) => {
      let c = 0;
      for (let k = 1; k < cols; k++) if (heights[k] < heights[c] - 0.01) c = k;
      out[c].push({ it, i });
      heights[c] += getRatio(it) + extraHeight;
    });
    return out;
  }, [items, cols, getRatio, extraHeight]);

  return (
    <div className="masonry" ref={ref} role="list">
      {columns.map((col, c) => (
        <div className="masonry-col" key={c} role="none">
          {col.map(({ it, i }) => (
            <div role="listitem" key={getKey(it)}>{renderItem(it, i)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
