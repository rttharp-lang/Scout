// Mascot Lab — bare-hash router (#home, #studio, …). Only bare #tokens survive in
// the claude.ai Artifact frame, so no paths, no query strings.
import { useEffect, useState } from "react";
import { ROUTES } from "../../brand.js";

/** currentRoute() → one of ROUTES ("home" for an empty/unknown hash). */
export function currentRoute() {
  if (typeof window === "undefined") return "home";
  const t = (window.location.hash || "").replace(/^#\/?/, "").split(/[/?&]/)[0].toLowerCase();
  return ROUTES.includes(t) ? t : "home";
}

/** navigate(route) — go to a route (no-op scroll-to-top if already there). */
export function navigate(route) {
  const r = ROUTES.includes(route) ? route : "home";
  if (currentRoute() === r && window.location.hash === `#${r}`) {
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }
  window.location.hash = r;
}

/** useRoute() → the current route, re-rendering on hashchange. */
export function useRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const on = () => setRoute(currentRoute());
    window.addEventListener("hashchange", on);
    on();
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

/** href(route) → "#route" for <a href>. */
export const href = (route) => `#${route}`;
