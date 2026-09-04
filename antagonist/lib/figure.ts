import type { Archetype } from "@/content/types";
import { hashString, seeded } from "./utils";

/**
 * Abstract figure silhouettes: 15-point polygons with the same point count,
 * so GSAP can morph between them. Shared by Act 02 (the room) and Act 03
 * (the crowd arrives) so the same body persists across both.
 */
export function figureFor(a: Archetype): string {
  const r = seeded(hashString(a.id));
  const shoulder = 22 + r() * 16;
  const head = 8 + r() * 3;
  const lean = (r() - 0.5) * 14;
  const hip = 14 + r() * 8;
  const armL = r() > 0.5 ? -shoulder - 10 - r() * 14 : -shoulder - 2;
  const armR = r() > 0.5 ? shoulder + 10 + r() * 14 : shoulder + 2;
  const armLy = 30 + r() * 30;
  const armRy = 30 + r() * 30;
  const pts: [number, number][] = [
    [50 + lean, 4],
    [50 + lean + head, 9],
    [50 + lean + head * 0.6, 18],
    [50 + shoulder, 24],
    [50 + armR, armRy],
    [50 + shoulder * 0.7, 46],
    [50 + hip, 62],
    [50 + hip + 6, 100],
    [50 - hip - 6, 100],
    [50 - hip, 62],
    [50 - shoulder * 0.7, 46],
    [50 + armL, armLy],
    [50 - shoulder, 24],
    [50 + lean - head * 0.6, 18],
    [50 + lean - head, 9],
  ];
  return pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
}
