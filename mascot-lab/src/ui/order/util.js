// Mascot Lab — small helpers for the order pages.
import { useEffect, useState } from "react";
import { PRODUCTS } from "../../order/catalog.js";

/** Short column labels for the roster grid (fits a 60px column). */
export const SHORT_NAMES = { jersey: "Jersey", shorts: "Shorts", hoodie: "Hoodie", pants: "Pants", tee: "Tee", longsleeve: "Shooter" };
export const shortName = (id) => SHORT_NAMES[id] || PRODUCTS[id]?.name || id;
export const productName = (id, garment) => garment?.name || PRODUCTS[id]?.name || id;

/** useMedia("(max-width: 720px)") → boolean, live. */
export function useMedia(query) {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(query);
    const fn = () => setOn(m.matches);
    fn();
    m.addEventListener?.("change", fn);
    return () => m.removeEventListener?.("change", fn);
  }, [query]);
  return on;
}

/** plural(3, "player") → "3 players". */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** addBusinessDays(date, n) → Date. */
export function addBusinessDays(date, n) {
  const d = new Date(date);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** isoDate(Date) → "YYYY-MM-DD" in local time. */
export function isoDate(d) {
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function shortDate(d, withYear = false) {
  try {
    return new Date(d).toLocaleDateString("en-US", withYear ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
  } catch {
    return String(d);
  }
}

/** copyText(text) → Promise<boolean> — clipboard API, then the execCommand fallback. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
