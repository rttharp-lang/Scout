"use client";
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ProductLens } from "@/content/types";

/**
 * ACT 05 — the garment object.
 *
 * One abstract, procedurally lit garment form that stays on screen while the ten
 * product lenses cut past. Each lens sets shader uniforms (proportion, graphic,
 * colour, grain, trim, mark, layering, tilt) and a camera set-up (zoom, orbit,
 * look) so the object *becomes* the lens rather than illustrating it. It is
 * deliberately not a real jersey: a shape with the posture of one.
 *
 * Targets live in a ref (`stateRef`) written by the scroll story; useFrame eases
 * toward them, so React never re-renders on scroll.
 */

export type ObjectState = ProductLens["object"] & { present?: number };

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uProportion;
  uniform float uGrain;
  uniform float uShell;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;

  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vUv = uv;
    vec3 p = position;
    float shoulder = smoothstep(0.3, 1.0, p.y);
    p.x *= 1.0 + uProportion * 0.5 * shoulder;
    p.z *= 1.0 + uProportion * 0.25 * shoulder;
    float hem = smoothstep(-0.3, -1.3, p.y);
    p.y -= uProportion * 0.4 * hem;
    float n = snoise(vec3(p.xy * 2.2, uTime * 0.35));
    float n2 = snoise(vec3(p.xz * 9.0, uTime * 0.2 + 5.0));
    p += normal * (n * 0.035 + n2 * 0.06 * uGrain);
    p += normal * uShell * 0.07;
    vPos = p;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = -mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uGraphic;
  uniform float uHue;
  uniform float uGrain;
  uniform float uTrim;
  uniform float uMark;
  uniform float uShell;
  uniform float uLayer;
  uniform vec3 uBase;
  uniform vec3 uAccent;
  uniform vec3 uClash;
  uniform vec3 uPaper;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float front = smoothstep(-0.2, 0.6, n.z);

    vec3 col = mix(uBase, uAccent, smoothstep(0.0, 0.6, uHue));
    float split = step(0.8, vUv.y);
    col = mix(col, uClash, smoothstep(0.55, 1.0, uHue) * split);

    float band = step(0.5, fract(vUv.y * 3.0 + 0.2));
    float slashD = fract(vUv.x * 2.0 + vUv.y * 0.9);
    float slash = smoothstep(0.03, 0.0, abs(slashD - 0.5) - 0.11);
    col = mix(col, uPaper, band * uGraphic * 0.85);
    col = mix(col, mix(uAccent, uBase, smoothstep(0.0,0.6,uHue)), slash * uGraphic);

    float box = step(abs(vPos.x - 0.22), 0.2) * step(abs(vPos.y - 0.42), 0.14) * front;
    float boxInner = step(abs(vPos.x - 0.22), 0.14) * step(abs(vPos.y - 0.42), 0.08) * front;
    col = mix(col, uPaper, box * uMark);
    col = mix(col, uBase, boxInner * uMark);

    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    float hemLine = smoothstep(0.02, 0.0, abs(vUv.y - 0.03)) + smoothstep(0.02, 0.0, abs(vUv.y - 0.965));
    vec3 trimCol = mix(uAccent, uPaper, step(0.5, uHue));
    col = mix(col, trimCol, clamp(hemLine + fres * 0.9, 0.0, 1.0) * uTrim);

    float g = hash(vUv * 900.0 + floor(uTime * 8.0));
    col += (g - 0.5) * 0.16 * uGrain;
    float sheen = pow(max(dot(reflect(-v, n), normalize(vec3(0.4, 0.9, 0.6))), 0.0), 18.0);
    col += sheen * (0.08 + uGrain * 0.35);

    float diff = max(dot(n, normalize(vec3(0.35, 1.0, 0.7))), 0.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.2);
    col = col * (0.32 + 0.78 * diff) + rim * vec3(0.55, 0.65, 1.0) * 0.22;

    float alpha = 1.0;
    if (uShell > 0.5) {
      alpha = uLayer * (0.25 + fres * 0.6);
      col = mix(col, uPaper, 0.3);
    }
    gl_FragColor = vec4(col, alpha);
  }
`;

function makeGeometry() {
  const pts = [
    [0.62, -1.3], [0.66, -1.0], [0.7, -0.5], [0.71, 0.0], [0.76, 0.4], [0.9, 0.7],
    [1.0, 0.82], [0.86, 0.94], [0.48, 1.0], [0.36, 1.1], [0.3, 1.18], [0.26, 1.2],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  // Resample through a spline so the shading reads as cloth, not as stacked rings.
  const smooth = new THREE.SplineCurve(pts).getPoints(64);
  const geo = new THREE.LatheGeometry(smooth, 96);
  geo.computeVertexNormals();
  return geo;
}

interface Props {
  stateRef: React.MutableRefObject<ObjectState>;
  pointerRef: React.MutableRefObject<{ x: number; y: number; spin: number }>;
  colors: { base: string; accent: string; clash: string; paper: string };
}

function Garment({ stateRef, pointerRef, colors }: Props) {
  const group = useRef<THREE.Group>(null);
  const geo = useMemo(makeGeometry, []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProportion: { value: 0 },
      uGraphic: { value: 0 },
      uHue: { value: 0 },
      uGrain: { value: 0.1 },
      uTrim: { value: 0 },
      uMark: { value: 0 },
      uLayer: { value: 0 },
      uShell: { value: 0 },
      // three converts hex → linear on construction; this shader writes display values
      // directly, so convert back to keep the config colours as authored.
      uBase: { value: new THREE.Color(colors.base).convertLinearToSRGB() },
      uAccent: { value: new THREE.Color(colors.accent).convertLinearToSRGB() },
      uClash: { value: new THREE.Color(colors.clash).convertLinearToSRGB() },
      uPaper: { value: new THREE.Color(colors.paper).convertLinearToSRGB() },
    }),
    // Created once: the renderer binds this object at compile time, so it must never be replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  useEffect(() => {
    uniforms.uBase.value.set(colors.base).convertLinearToSRGB();
    uniforms.uAccent.value.set(colors.accent).convertLinearToSRGB();
    uniforms.uClash.value.set(colors.clash).convertLinearToSRGB();
    uniforms.uPaper.value.set(colors.paper).convertLinearToSRGB();
  }, [colors, uniforms]);

  // Materials are built imperatively so the uniform objects are bound exactly once.
  const materials = useMemo(() => {
    const body = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms });
    const shell = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { ...uniforms, uShell: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return { body, shell };
  }, [uniforms]);
  useEffect(() => () => {
    materials.body.dispose();
    materials.shell.dispose();
  }, [materials]);

  const cur = useRef<Required<ObjectState>>({ proportion: 0, graphic: 0, hue: 0, grain: 0.1, trim: 0, mark: 0, layer: 0, tilt: 0, zoom: 0, orbit: 0, look: 0, present: 0 });
  const { viewport, camera } = useThree();
  const lookAt = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.001, dt); // frame-rate independent ease
    const c = cur.current, t = stateRef.current;
    (Object.keys(c) as (keyof Required<ObjectState>)[]).forEach((key) => {
      const target = t[key] ?? (key === "present" ? 1 : 0);
      c[key] += (target - c[key]) * k * 0.9;
    });
    uniforms.uTime.value += dt;
    uniforms.uProportion.value = c.proportion;
    uniforms.uGraphic.value = c.graphic;
    uniforms.uHue.value = c.hue;
    uniforms.uGrain.value = c.grain;
    uniforms.uTrim.value = c.trim;
    uniforms.uMark.value = c.mark;
    uniforms.uLayer.value = c.layer;
    if (group.current) {
      const p = pointerRef.current;
      // Orbit is the camera's move per lens; the pointer nudges it; drag spins it.
      group.current.rotation.y += ((p.spin + p.x * 0.35 + c.orbit * 1.3 + Math.sin(uniforms.uTime.value * 0.25) * 0.2) - group.current.rotation.y) * k;
      group.current.rotation.x += ((c.tilt * 0.45 + p.y * 0.12) - group.current.rotation.x) * k;
      group.current.rotation.z += ((c.tilt * -0.25) - group.current.rotation.z) * k;
      // Fit the object to the stage on both axes; portrait stages (mobile) sit it lower, under the chrome.
      const fit = Math.min(0.98, viewport.width / 3.2, viewport.height / 2.6);
      group.current.scale.setScalar(fit * (0.001 + Math.max(0, c.present)));
      group.current.position.y = viewport.aspect < 1 ? -0.35 : -0.05;
    }
    // Camera: zoom pushes in; look tilts the point of interest between hem and collar.
    const targetZ = 5.8 - c.zoom * 3.4;
    const targetY = c.look * 0.9 * (0.4 + c.zoom);
    camera.position.z += (targetZ - camera.position.z) * k;
    camera.position.y += (targetY * 0.6 - camera.position.y) * k;
    lookAt.current.set(0, targetY, 0);
    camera.lookAt(lookAt.current);
  });

  return (
    <group ref={group} position={[0, -0.05, 0]}>
      <mesh geometry={geo} scale={[1, 1, 0.42]} material={materials.body} />
      <mesh geometry={geo} scale={[1.06, 1.04, 0.5]} position={[0, -0.06, 0]} material={materials.shell} />
    </group>
  );
}

export default function GarmentScene(props: Props) {
  return (
    <Canvas
      dpr={[1, 1.6]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      camera={{ position: [0, 0, 5.8], fov: 32 }}
      style={{ position: "absolute", inset: 0 }}
      frameloop="always"
    >
      <Garment {...props} />
    </Canvas>
  );
}
