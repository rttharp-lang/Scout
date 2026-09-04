"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { season } from "@/content/season";
import { gsap, useGsap, useReducedMotion } from "@/lib/hooks";
import { useSound } from "@/components/system/SoundSystem";
import { clamp } from "@/lib/utils";
import styles from "./Act01Reaction.module.css";

/**
 * ACT 01 — THE REACTION
 * One room, no sections. The white of the tunnel burst is the arena light coming up;
 * it decays over a field of attention that is already alive. The headline is spoken
 * in cuts. Then the copy stops and the field does the talking: where the user pushes
 * the slider decides which sentence exists. Only the middle is empty.
 */

interface P { x: number; y: number; vx: number; vy: number; side: -1 | 1; life: number; seed: number }

export default function Act01Reaction() {
  const { reaction, palette } = season;
  const reduced = useReducedMotion();
  const { setHostility, cue } = useSound();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valueRef = useRef(0);
  const userRef = useRef(false);
  const [display, setDisplay] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"light" | "line1" | "line2" | "field">(reduced ? "field" : "light");
  const trackRef = useRef<HTMLDivElement>(null);
  const lastCue = useRef(0);
  const [extremeSeen, setExtremeSeen] = useState(false);

  const setValue = useCallback(
    (v: number, byUser = true) => {
      v = clamp(v, -1, 1);
      valueRef.current = v;
      if (byUser) userRef.current = true;
      setDisplay(v);
      setHostility(Math.max(0, v));
      if (Math.abs(v) > 0.72) setExtremeSeen(true);
      const now = performance.now();
      if (byUser && v > 0.85 && now - lastCue.current > 1500) {
        lastCue.current = now;
        cue("boo", 0.8);
      }
    },
    [setHostility, cue]
  );

  // Attention field.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const accent = palette.accent, clash = palette.clash;
    let w = 0, h = 0;
    const N = reduced ? 0 : 520;
    const ps: P[] = [];
    const spawn = (p: P, side: -1 | 1) => {
      p.side = side;
      p.x = side < 0 ? -20 - Math.random() * w * 0.3 : w + 20 + Math.random() * w * 0.3;
      p.y = Math.random() * h;
      p.vx = 0; p.vy = 0; p.life = 0.5 + Math.random(); p.seed = Math.random() * 6.28;
    };
    for (let i = 0; i < N; i++) {
      const p = { x: 0, y: 0, vx: 0, vy: 0, side: 1 as 1 | -1, life: 1, seed: 0 };
      spawn(p, i % 2 ? 1 : -1);
      p.x = Math.random() * w;
      ps.push(p);
    }
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    let raf = 0, visible = true, t = 0;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible || !w) return;
      t += 0.016;
      const v = valueRef.current;
      const intensity = Math.abs(v);
      ctx.fillStyle = "rgba(7,7,7,0.28)";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (const p of ps) {
        const dominant = p.side === (v >= 0 ? 1 : -1) ? 1 : 0.15;
        const drive = (0.08 + intensity * 1.6) * dominant;
        const dx = cx - p.x, dy = cy - p.y;
        const d = Math.hypot(dx, dy) + 1;
        const wob = Math.sin(t * 2 + p.seed) * (1 - intensity) * 0.9;
        p.vx += (dx / d) * drive + wob * 0.3;
        p.vy += (dy / d) * drive * 0.6 + Math.cos(t * 1.7 + p.seed) * 0.15;
        p.vx *= 0.92; p.vy *= 0.92;
        p.x += p.vx; p.y += p.vy;
        if (d < 80 + intensity * 60 || p.x < -w * 0.4 || p.x > w * 1.4) spawn(p, p.side);
        const alpha = (0.15 + intensity * 0.85) * dominant * clamp(1 - d / (w * 0.7), 0.15, 1);
        const grey = 1 - intensity;
        ctx.fillStyle = p.side > 0 ? accent : clash;
        ctx.globalAlpha = alpha * (1 - grey * 0.7);
        const s = 1 + intensity * 2.4 * dominant;
        ctx.fillRect(p.x, p.y, s * 2.2, s * 0.9);
      }
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120 + intensity * 260);
      const c = v > 0 ? accent : clash;
      g.addColorStop(0, `${c}${Math.round(intensity * 90).toString(16).padStart(2, "0")}`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };
    loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [palette, reduced]);

  const scope = useGsap(
    (_, el) => {
      if (reduced) return;
      const light = el.querySelector("[data-light]") as HTMLElement;
      gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: "+=340%",
          pin: el.querySelector("[data-stage]") as HTMLElement,
          scrub: 0.4,
          onUpdate: (self) => {
            const p = self.progress;
            // The arena light from the tunnel decays over the first stretch.
            light.style.opacity = String(Math.pow(clamp(1 - p / 0.07), 2));
            setPhase(p < 0.08 ? "light" : p < 0.24 ? "line1" : p < 0.36 ? "line2" : "field");
            if (userRef.current) return;
            // Until the user takes the slider, scroll sweeps it: love → dead centre → hate.
            const q = clamp((p - 0.38) / 0.55);
            const v = q < 0.4 ? -1 + (q / 0.4) : q < 0.75 ? ((q - 0.4) / 0.35) : 1 - ((q - 0.75) / 0.25) * 0.25;
            setValue(p < 0.38 ? -0.2 : v, false);
          },
        },
      });
    },
    [reduced]
  );

  const pointerToValue = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    return r ? ((clientX - r.left) / r.width) * 2 - 1 : 0;
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.25 : 0.08;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setValue(valueRef.current + step); }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setValue(valueRef.current - step); }
    if (e.key === "Home") setValue(-1);
    if (e.key === "End") setValue(1);
  };

  const intensity = Math.abs(display);
  const neutral = intensity < 0.12;
  const inField = phase === "field";

  return (
    <section id="act-reaction" className={`act ${styles.act}`} ref={scope} aria-label="Act 01 — The Reaction" data-theme="dark">
      <div className={`pin-stage ${styles.stage} ${reduced ? styles.static : ""}`} data-stage>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        <div className={styles.light} data-light aria-hidden="true" />

        {/* The headline is spoken in cuts over the live field. */}
        <h2 className={`${styles.headline} t-display`} aria-hidden={inField}>
          <span className={styles.cut} style={{ visibility: phase === "line1" || reduced ? "visible" : "hidden" }}>
            <span>{reaction.headline[0]}</span>
            <span>{reaction.headline[1]}</span>
          </span>
          <span className={`${styles.cut} ${styles.hot}`} style={{ visibility: phase === "line2" || reduced ? "visible" : "hidden" }}>
            <span>{reaction.headline[2]}</span>
          </span>
        </h2>

        {/* The field's readout: which sentence exists depends on where the user pushed. */}
        <div className={styles.center} style={{ opacity: inField ? 1 : 0 }} aria-live="polite">
          <div
            className={`${styles.cant} t-display`}
            style={{
              transform: `scale(${0.5 + intensity * 0.6})`,
              opacity: neutral ? 0.12 : 0.6 + intensity * 0.4,
              color: display > 0 ? palette.accent : palette.clash,
              filter: `blur(${(1 - intensity) * 3}px)`,
            }}
          >
            {reaction.axis.center}
          </div>
          <div className={`${styles.readout} t-mono t-mono--lg`}>
            <p style={{ opacity: neutral ? 1 : 0 }}>
              {reaction.axis.neutral}
              <span>{reaction.lines[1]}</span>
            </p>
            <p style={{ opacity: !neutral && intensity > 0.72 ? 1 : 0 }}>
              {reaction.reveal}
              <span>{reaction.lines[0]} {reaction.lines[2]}</span>
            </p>
          </div>
        </div>

        <div className={styles.axis} style={{ opacity: inField ? 1 : 0 }}>
          <span className={`${styles.pole} t-wide`} style={{ opacity: 0.35 + Math.max(0, -display) * 0.65, color: palette.clash }}>
            {reaction.axis.left}
          </span>
          <div
            ref={trackRef}
            className={styles.track}
            role="slider"
            tabIndex={inField ? 0 : -1}
            aria-label="Attention spectrum, love to hate"
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={Math.round(display * 100)}
            aria-valuetext={neutral ? "neutral" : `${Math.round(intensity * 100)} percent ${display > 0 ? "hate" : "love"}`}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDragging(true); setValue(pointerToValue(e.clientX)); }}
            onPointerMove={(e) => dragging && setValue(pointerToValue(e.clientX))}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onKeyDown={onKey}
          >
            <span className={styles.line} />
            <span className={styles.tick} />
            <span className={`${styles.knob} ${dragging ? styles.knobActive : ""}`} style={{ left: `${(display + 1) * 50}%`, background: display > 0 ? palette.accent : palette.clash }} />
          </div>
          <span className={`${styles.pole} t-wide`} style={{ opacity: 0.35 + Math.max(0, display) * 0.65, color: palette.accent }}>
            {reaction.axis.right}
          </span>
        </div>
        <p className={`${styles.instruction} t-mono`} style={{ opacity: inField && !userRef.current && !extremeSeen ? 0.6 : 0 }}>
          Push it. Drag · arrow keys
        </p>
      </div>
    </section>
  );
}
