// photo engine · the studio light and the colour science shared by bake and composite.
//
// One key light from the upper left (LIGHT), a soft fill, and a camera that sees cloth the
// way a product photographer exposes it: the garment's own colour where the cloth faces
// the camera, highlights rolling off through a filmic shoulder, near-black fabric lifted a
// touch so its construction stays visible (as on any e-commerce shot of a black hoodie).

/** Direction TOWARDS the key light in image space (x right, y down): upper left. */
export const LIGHT = (() => {
  const L = Math.hypot(-0.62, -0.78);
  return [-0.62 / L, -0.78 / L];
})();

/** sRGB byte → linear. */
export const TO_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  TO_LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// linear (0 … LUT_MAX) → sRGB byte, with a soft filmic shoulder above KNEE so highlights
// on white or gold cloth roll off instead of clipping flat.
export const LUT_N = 8192;
export const LUT_MAX = 2;
export const LUT_K = LUT_N / LUT_MAX;
export const TO_SRGB = new Uint8ClampedArray(LUT_N + 1);
{
  const KNEE = 0.8;
  for (let i = 0; i <= LUT_N; i++) {
    let v = (i / LUT_N) * LUT_MAX;
    if (v > KNEE) v = KNEE + (1 - KNEE) * (1 - Math.exp(-(v - KNEE) / (1 - KNEE)));
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    TO_SRGB[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
  }
}

/**
 * Light model (per view, every key optional):
 *   exposure    irradiance of an unshaded, unlit pixel (1 = the colour as specified)
 *   diffuse     how far the light map can lift a pixel (multiplier added to exposure)
 *   shadowGain  γ on the shadow transmittance: >1 deepens every authored shadow at once
 *   lightGain   γ on the light map
 *   sheen       colourless lift in lit areas (what makes black fleece read)
 *   printSheen  the same on ink (plastisol is flatter than brushed fleece)
 *   inkGrain    how much fabric grain shows through ink (0 … 0.3)
 *   floor       linear albedo floor (lifts near-black cloth into the visible range)
 */
export const DEFAULT_LIGHT_MODEL = {
  exposure: 1.0, diffuse: 1.25, shadowGain: 1.7, lightGain: 1.6,
  sheen: 0.1, printSheen: 0.05, inkGrain: 0.12, floor: 0.012,
};

const lutCache = new Map();
/**
 * shade/light transfer LUTs for a model. The dark map stores 1 − Π(1 − aᵢ) of every
 * shadow stroke, so raising the transmittance to γ scales the optical density of EVERY
 * stroke at once — a global "shadow strength" knob that keeps the painted relationships.
 *   shadeLUT[v] = E · (1 − v/255)^γd      lightLUT[v] = KD · (1 − (1 − v/255)^γl)
 */
export function lightLUTs(model) {
  const m = { ...DEFAULT_LIGHT_MODEL, ...(model || {}) };
  const key = `${m.exposure}|${m.diffuse}|${m.shadowGain}|${m.lightGain}`;
  let hit = lutCache.get(key);
  if (hit) return hit;
  const shadeLUT = new Float32Array(256), lightLUT = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    shadeLUT[v] = m.exposure * (1 - v / 255) ** m.shadowGain;
    lightLUT[v] = m.diffuse * (1 - (1 - v / 255) ** m.lightGain);
  }
  hit = { shadeLUT, lightLUT };
  lutCache.set(key, hit);
  return hit;
}
