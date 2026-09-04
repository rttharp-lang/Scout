"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/hooks";

interface ScrollCtx {
  lenis: Lenis | null;
  reduced: boolean;
  scrollTo: (target: string | number | HTMLElement, opts?: { immediate?: boolean }) => void;
}

const Ctx = createContext<ScrollCtx>({ lenis: null, reduced: false, scrollTo: () => {} });
export const useScroll = () => useContext(Ctx);

/**
 * Lenis smooth scroll driven by GSAP's ticker so ScrollTrigger and Lenis share one clock.
 * Reduced motion: Lenis is not created and native scrolling is used.
 */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const lenisRef = useRef<Lenis | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({
      lerp: 0.09,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.4,
      smoothWheel: true,
      syncTouch: false,
    });
    lenisRef.current = lenis;
    force((n) => n + 1);

    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    document.documentElement.classList.add("lenis");

    // Pins re-measure after fonts load, otherwise the first scroll jumps.
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    window.addEventListener("load", refresh);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
      document.documentElement.classList.remove("lenis");
      window.removeEventListener("load", refresh);
    };
  }, [reduced]);

  const scrollTo: ScrollCtx["scrollTo"] = (target, opts) => {
    if (lenisRef.current) lenisRef.current.scrollTo(target, { immediate: opts?.immediate, duration: 1.4 });
    else if (typeof target === "string") document.querySelector(target)?.scrollIntoView();
    else if (typeof target === "number") window.scrollTo(0, target);
    else target.scrollIntoView();
  };

  return <Ctx.Provider value={{ lenis: lenisRef.current, reduced, scrollTo }}>{children}</Ctx.Provider>;
}
