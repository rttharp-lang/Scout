"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * ACT 00 — the arena tunnel.
 *
 * A single full-screen quad. The fragment shader projects a square corridor,
 * lit by fluorescent strips that flicker. `progress` (0..1, scroll) drives the
 * camera forward; `burst` (0..1) blows the lights out into white at the reveal.
 * Cheap enough for integrated GPUs: one draw call, no textures.
 */

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const frag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uZ;        // camera depth
  uniform float uBurst;    // 0..1 light burst
  uniform float uFlicker;  // 0..1 hostility of the lights
  uniform vec2 uRes;
  uniform vec2 uPointer;   // -1..1
  uniform vec3 uAccent;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    p.x *= uRes.x / uRes.y;
    p += uPointer * 0.06;

    // Square corridor: depth is inverse of the Chebyshev distance.
    float r = max(abs(p.x), abs(p.y) * 1.15);
    float depth = 1.0 / max(r, 0.02);
    float z = depth + uZ;

    // Wall coordinate around the corridor.
    float a = atan(p.y, p.x);
    float wall = step(abs(p.x), abs(p.y) * 1.15); // 1 = floor/ceiling, 0 = side walls
    float side = (a > 0.0) ? 1.0 : 0.0;

    // Concrete panels.
    float panel = smoothstep(0.02, 0.06, abs(fract(z * 0.5) - 0.5)) ;
    float grime = noise(vec2(z * 1.5, a * 3.0)) * 0.5 + noise(vec2(z * 6.0, a * 12.0)) * 0.25;
    vec3 concrete = vec3(0.018, 0.018, 0.018) + grime * 0.035;
    concrete *= panel;

    // Fluorescent strips on the ceiling every 1.2 units, some dead, some flickering.
    float strip = 0.0;
    float sz = fract(z / 1.2);
    float id = floor(z / 1.2);
    float alive = step(0.28, hash(id * 7.1));
    float flick = 1.0;
    float fseed = hash(id * 3.3);
    if (fseed > 0.55) {
      flick = 0.6 + 0.4 * step(0.5, fract(uTime * (4.0 + fseed * 30.0) + fseed * 10.0)) ;
      flick = mix(1.0, flick, uFlicker * 0.9 + 0.1);
    }
    float onCeiling = wall * side;
    float stripMask = smoothstep(0.04, 0.0, abs(sz - 0.5) - 0.03);
    float widthMask = smoothstep(0.42, 0.34, abs(p.x) / max(abs(p.y), 0.001));
    strip = stripMask * widthMask * onCeiling * alive * flick;

    // Light falling from the strips onto the walls.
    float glow = alive * flick * (0.35 + 0.65 * smoothstep(0.5, 0.0, abs(sz - 0.5))) * 0.07;

    vec3 col = concrete + vec3(glow) * vec3(0.85, 0.9, 1.0);
    col += strip * vec3(1.3, 1.35, 1.4);

    // Fog into black at depth.
    float fog = 1.0 - exp(-depth * 0.22);
    col = mix(col, vec3(0.0), fog);

    // Distant exit: a hostile glow at the vanishing point.
    float exitGlow = smoothstep(0.35, 0.0, r) * (0.15 + 0.85 * uBurst);
    col += uAccent * exitGlow * 0.9;

    // Burst: everything blows to white.
    col = mix(col, vec3(1.0), uBurst * uBurst * smoothstep(1.4, 0.0, r));

    // Vignette + grain.
    float vig = smoothstep(1.9, 0.4, length(p));
    col *= mix(0.25, 1.0, vig);
    col += (hash2(vUv * uRes + uTime) - 0.5) * 0.035;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface TunnelHandle {
  progress: number; // 0..1
  burst: number;    // 0..1
  flicker: number;  // 0..1
}

export default function TunnelCanvas({ handle, accent }: { handle: React.MutableRefObject<TunnelHandle>; accent: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uTime: { value: 0 },
      uZ: { value: 0 },
      uBurst: { value: 0 },
      uFlicker: { value: 0.3 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uAccent: { value: new THREE.Color(accent).convertLinearToSRGB() },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

    const target = new THREE.Vector2();
    const onMove = (e: PointerEvent) => {
      target.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      uniforms.uRes.value.set(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 });
    io.observe(canvas);

    const start = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const h = handle.current;
      uniforms.uTime.value = (performance.now() - start) / 1000;
      // Ease-in travel: slow walk, then a sprint into the light.
      uniforms.uZ.value = h.progress * 26 + Math.pow(h.progress, 3) * 40 + uniforms.uTime.value * 0.35;
      uniforms.uBurst.value = h.burst;
      uniforms.uFlicker.value = h.flicker;
      uniforms.uPointer.value.lerp(target, 0.05);
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      mat.dispose();
      renderer.dispose();
    };
  }, [handle, accent]);

  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true" />;
}
