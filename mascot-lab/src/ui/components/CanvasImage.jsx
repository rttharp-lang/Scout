import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Skeleton } from "./Skeleton.jsx";
import { Spinner } from "./Button.jsx";
import { cx } from "./cx.js";
import "./components.css";

const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * CanvasImage — shows an HTMLCanvasElement responsively. The box reserves its
 * aspect ratio up front (no layout shift); the source is redrawn into an on-screen
 * canvas sized to the box × devicePixelRatio (cheap, sharp, no data-URL encode).
 *   canvas: source canvas (or null → skeleton); alt: accessible description;
 *   ratio: w/h (default: the source's, else 1); fit: "contain" | "cover";
 *   stage: "none" | "paper" | "dark" | "mid" | "team" | "surface" | "checker";
 *   loading: dims + spinner over the current image (stale-while-rendering);
 *   error: string shown instead of the image; padding: inset fraction (0–0.4).
 */
export function CanvasImage({ canvas, alt = "", ratio, fit = "contain", stage = "none", loading = false, error = null, padding = 0, className, style, onClick, children, ...rest }) {
  const boxRef = useRef(null);
  const outRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const r = ratio || (canvas && canvas.width && canvas.height ? canvas.width / canvas.height : 1);

  useIso(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - b.width) < 0.5 && Math.abs(s.h - b.height) < 0.5 ? s : { w: b.width, h: b.height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useIso(() => {
    const out = outRef.current;
    if (!out || !canvas || !size.w || !size.h) return;
    const dpr = Math.min(3, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const W = Math.max(1, Math.round(size.w * dpr));
    const H = Math.max(1, Math.round(size.h * dpr));
    if (out.width !== W) out.width = W;
    if (out.height !== H) out.height = H;
    const ctx = out.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    const sw = canvas.width, sh = canvas.height;
    if (!sw || !sh) return;
    const pad = Math.max(0, Math.min(0.4, padding));
    const bw = W * (1 - 2 * pad), bh = H * (1 - 2 * pad);
    const k = fit === "cover" ? Math.max(bw / sw, bh / sh) : Math.min(bw / sw, bh / sh);
    const dw = sw * k, dh = sh * k;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }, [canvas, size.w, size.h, fit, padding]);

  return (
    <div
      ref={boxRef}
      className={cx("ml-canvas", `ml-stage--${stage}`, loading && "is-loading", className)}
      style={{ aspectRatio: String(r), ...style }}
      onClick={onClick}
      {...rest}
    >
      {canvas && !error ? (
        <canvas ref={outRef} role="img" aria-label={alt} />
      ) : !error ? (
        <Skeleton />
      ) : null}
      {error && <div className="ml-canvas__error" role="img" aria-label={`${alt}: ${error}`}>{error}</div>}
      <div className="ml-canvas__veil" aria-hidden="true">{loading && canvas ? <Spinner /> : null}</div>
      {children}
    </div>
  );
}

export default CanvasImage;
