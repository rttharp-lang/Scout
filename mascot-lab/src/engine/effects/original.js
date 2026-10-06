// "Clean" — the logo exactly as uploaded, with an optional sticker-style keyline.
import { createCanvas, ctx2d, alphaMask, dilateMask, maskToCanvas } from "../core.js";

export default {
  id: "original",
  name: "Clean",
  category: "print",
  blurb: "Your logo as-is, ready to print.",
  method: "Screen print",
  stage: "paper",
  params: [
    { key: "outline", label: "Keyline", type: "toggle", default: false },
    { key: "outlineColor", label: "Keyline color", type: "color", default: "accent" },
    { key: "outlineWidth", label: "Keyline width", type: "range", min: 4, max: 48, step: 1, default: 16, unit: "px" },
  ],
  presets: [
    { name: "As uploaded", params: { outline: false } },
    { name: "Keyline", params: { outline: true, outlineColor: "secondary", outlineWidth: 12 } },
    { name: "Bold sticker", params: { outline: true, outlineColor: "accent", outlineWidth: 32 } },
  ],
  render(src, p, ctx) {
    const S = src.width;
    const out = createCanvas(S, S);
    const o = ctx2d(out);
    if (p.outline) {
      // work at ≤1024 for the distance field, then scale the keyline up smoothly
      const W = Math.min(S, 1024);
      const k = W / S;
      let small = src;
      if (W !== S) {
        small = createCanvas(W, W);
        const sx = ctx2d(small);
        sx.imageSmoothingQuality = "high";
        sx.drawImage(src, 0, 0, W, W);
      }
      const r = p.outlineWidth * ctx.scale * k;
      const grown = dilateMask(alphaMask(small), W, W, r);
      const line = maskToCanvas(grown, W, W, p.outlineColor);
      o.imageSmoothingEnabled = true;
      o.imageSmoothingQuality = "high";
      o.drawImage(line, 0, 0, S, S);
    }
    o.drawImage(src, 0, 0);
    return out;
  },
};
