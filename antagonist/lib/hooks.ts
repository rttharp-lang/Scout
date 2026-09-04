"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "./gsap";

export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** True when the OS asks for reduced motion. The whole experience degrades to a static, readable document. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Coarse pointer = touch device. Interactions that need hover get a scroll-driven alternative. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

let webglCache: boolean | null = null;
/** Cheap WebGL capability probe. Null until mounted so SSR renders the fallback. */
export function useWebGL(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(webglCache);
  useEffect(() => {
    if (webglCache !== null) {
      setOk(webglCache);
      return;
    }
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      webglCache = !!gl;
    } catch {
      webglCache = false;
    }
    setOk(webglCache);
  }, []);
  return ok;
}

/**
 * Scoped GSAP context. Everything created inside `fn` is reverted on unmount,
 * which is what keeps ScrollTrigger pins from leaking between fast refreshes.
 */
export function useGsap(
  fn: (ctx: gsap.Context, scope: HTMLElement) => void,
  deps: React.DependencyList = []
) {
  const scope = useRef<HTMLDivElement | HTMLElement>(null);
  useIsoLayoutEffect(() => {
    if (!scope.current) return;
    const el = scope.current;
    // gsap.context runs the callback synchronously, so the context is passed via `self`.
    const ctx = gsap.context((self) => fn(self as gsap.Context, el), el);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return scope as React.RefObject<HTMLDivElement>;
}

export { gsap, ScrollTrigger };
