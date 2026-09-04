"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { season } from "@/content/season";
import { gsap, useGsap, useReducedMotion } from "@/lib/hooks";
import { useSound } from "@/components/system/SoundSystem";
import { clamp } from "@/lib/utils";
import styles from "./Act01Reaction.module.css";

/**
 * ACT 01 — THE REACTION
 * The spectrum is the argument: LOVE and HATE are opposite directions, but the
 * particles of attention from both ends land on the same word. Only the middle is empty.
 */

interface P {
  x: number; y: number; vx: number; vy: number; side: -1 | 1; life: number; seed: number;
}

export default function Act01Reaction() {
  const { reaction, palette } = season;
  const reduced = useReducedMotion();
  const { setHostility, cue } = useSound();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valueRef = useRef(0);        // -1 love … +1 hate
  const userRef = useRef(false);     // has the user taken the slider?
  const [display, setDisplay] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const lastCue = useRef(0);

  const setValue = useCallback(
    (v: number, byUser = true) => {
      v = clamp(v, -1, 1);
      valueRef.current = v;
      if (byUser) userRef.current = true;
      setDisplay(v);
      setHostility(Math.max(0, v));
      if (byUser && Math.abs(v) > 0.72 && !revealed) setRevealed(true);
      const now = performance.now();
      if (byUser && v > 0.85 && now - lastCue.current > 1500) {
        lastCue.current = now;
        cue("boo", 0.8);
      }
    },
    [setHostility, cue, revealed]
  );

  // Attention field.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const accent = palette.accent;
    const clash = palette.clash;
    let w = 0, h = 0, dpr = 1;
    const N = reduced ? 0 : 520;
    const ps: P[] = [];
    const spawn = (p: P, side: -1 | 1) => {
      p.side = side;
      p.x = side < 0 ? -20 - Math.random() * w * 0.3 : w + 20 + Math.random() * w * 0.3;
      p.y = Math.random() * h;
      p.vx = 0; p.vy = 0;
      p.life = 0.5 + Math.random();
      p.seed = Math.random() * 6.28;
    };
    for (let i = 0; i < N; i++) {
      const p = { x: 0, y: 0, vx: 0, vy: 0, side: 1 as 1 | -1, life: 1, seed: 0 };
      spawn(p, i % 2 ? 1 : -1);
      p.x = Math.random() * w;
      ps.push(p);
    }
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    let t = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible || !w) return;
      t += 0.016;
      const v = valueRef.current;
      const intensity = Math.abs(v);          // how much anyone cares
      const heat = (v + 1) / 2;               // 0 love … 1 hate
      ctx.fillStyle = "rgba(7,7,7,0.28)";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (const p of ps) {
        // Particles from the dominant side rush the centre; the other side idles.
        const dominant = p.side === (v >= 0 ? 1 : -1) ? 1 : 0.15;
        const drive = (0.08 + intensity * 1.6) * dominant;
        const dx = cx - p.x, dy = cy - p.y;
        const d = Math.hypot(dx, dy) + 1;
        const wob = Math.sin(t * 2 + p.seed) * (1 - intensity) * 0.9;
        p.vx += (dx / d) * drive + wob * 0.3;
        p.vy += (dy / d) * drive * 0.6 + Math.cos(t * 1.7 + p.seed) * 0.15;
        p.vx *= 0.92; p.vy *= 0.92;
        p.x += p.vx; p.y += p.vy;
        const near = d < 80 + intensity * 60;
        if (near || p.x < -w * 0.4 || p.x > w * 1.4) spawn(p, p.side);
        const alpha = (0.15 + intensity * 0.85) * dominant * clamp(1 - d / (w * 0.7), 0.15, 1);
        const grey = 1 - intensity;
        ctx.fillStyle = p.side > 0 ? accent : clash;
        ctx.globalAlpha = alpha * (1 - grey * 0.7);
        const s = 1 + intensity * 2.4 * dominant;
        ctx.fillRect(p.x, p.y, s * 2.2, s * 0.9);
        if (grey > 0.5) {
          ctx.fillStyle = "#3a3a38";
          ctx.globalAlpha = alpha * grey * 0.4;
          ctx.fillRect(p.x, p.y, 1.5, 1.5);
        }
      }
      ctx.globalAlpha = 1;
      // Centre burn.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120 + intensity * 260);
      const c = heat > 0.5 ? accent : clash;
      g.addColorStop(0, `${c}${Math.round(intensity * 90).toString(16).padStart(2, "0")}`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [palette, reduced]);

  // Scroll drives the marker until the user takes over (mobile / passive viewers still get the idea).
  const scope = useGsap(
    (_, el) => {
      if (reduced) return;
      gsap.timeline({
        scrollTrigger: {
          trigger: el.querySelector("[data-field]") as HTMLElement,
          start: "top top",
          end: "+=220%",
          pin: true,
          scrub: 0.5,
          onUpdate: (self) => {
            if (userRef.current) return;
            const p = self.progress;
            // sweep: love → neutral → hate → back to hate-ish
            const v = p < 0.45 ? -1 + (p / 0.45) * 1 : p < 0.8 ? ((p - 0.45) / 0.35) * 1 : 1 - ((p - 0.8) / 0.2) * 0.3;
            setValue(v, false);
            if (p > 0.55 && !revealed) setRevealed(true);
          },
        },
      });
      gsap.from(el.querySelectorAll("[data-head] span"), {
        yPercent: 110,
        stagger: 0.12,
        duration: 1.2,
        ease: "power4.out",
        scrollTrigger: { trigger: el.querySelector("[data-head]") as HTMLElement, start: "top 75%" },
      });
      gsap.from(el.querySelectorAll("[data-after] p"), {
        opacity: 0,
        y: 24,
        stagger: 0.2,
        scrollTrigger: { trigger: el.querySelector("[data-after]") as HTMLElement, start: "top 70%" },
      });
    },
    [reduced]
  );

  // Pointer / touch / keyboard control.
  const pointerToValue = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return ((clientX - r.left) / r.width) * 2 - 1;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    setValue(pointerToValue(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => dragging && setValue(pointerToValue(e.clientX));
  const onPointerUp = () => setDragging(false);
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.25 : 0.08;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setValue(valueRef.current + step); }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setValue(valueRef.current - step); }
    if (e.key === "Home") setValue(-1);
    if (e.key === "End") setValue(1);
  };

  const intensity = Math.abs(display);
  const neutral = intensity < 0.12;

  return (
    <section id="act-reaction" className={`act ${styles.act}`} ref={scope} aria-label="Act 01 — The Reaction" data-theme="dark">
      <header className={styles.head}>
        <h2 className={`${styles.headline} t-display`} data-head>
          {reaction.headline.map((l, i) => (
            <span key={i} className={i === reaction.headline.length - 1 ? styles.hot : ""}>
              <span>{l}</span>
            </span>
          ))}
        </h2>
      </header>

      <div className={`${styles.field} ${reduced ? styles.static : ""}`} data-field>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />

        <div className={styles.center} aria-live="polite">
          <div
            className={`${styles.cant} t-display`}
            style={{
              transform: `scale(${0.55 + intensity * 0.55})`,
              opacity: neutral ? 0.18 : 0.6 + intensity * 0.4,
              color: display > 0 ? palette.accent : palette.clash,
              filter: `blur(${(1 - intensity) * 3}px)`,
            }}
          >
            {reaction.axis.center}
          </div>
          <p className={`${styles.neutral} t-mono`} style={{ opacity: neutral ? 1 : 0 }}>
            {reaction.axis.neutral}
          </p>
        </div>

        <div className={styles.axis}>
          <span className={`${styles.pole} t-wide`} style={{ opacity: 0.4 + Math.max(0, -display) * 0.6, color: palette.clash }}>
            {reaction.axis.left}
          </span>
          <div
            ref={trackRef}
            className={styles.track}
            role="slider"
            tabIndex={0}
            aria-label="Attention spectrum, love to hate"
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={Math.round(display * 100)}
            aria-valuetext={neutral ? "neutral" : `${Math.round(intensity * 100)} percent ${display > 0 ? "hate" : "love"}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKey}
          >
            <span className={styles.line} />
            <span className={styles.tick} />
            <span
              className={`${styles.knob} ${dragging ? styles.knobActive : ""}`}
              style={{ left: `${(display + 1) * 50}%`, background: display > 0 ? palette.accent : palette.clash }}
            />
          </div>
          <span className={`${styles.pole} t-wide`} style={{ opacity: 0.4 + Math.max(0, display) * 0.6, color: palette.accent }}>
            {reaction.axis.right}
          </span>
        </div>

        <p className={`${styles.reveal} t-mono t-mono--lg`} style={{ opacity: revealed ? 1 : 0 }}>
          {reaction.reveal}
        </p>
        <p className={`${styles.instruction} t-mono`} style={{ opacity: userRef.current ? 0 : 0.6 }}>
          Drag · arrow keys
        </p>
      </div>

      <div className={styles.after} data-after>
        {reaction.lines.map((l, i) => (
          <p key={i} className={`${styles.line2} t-body`}>
            {l}
          </p>
        ))}
      </div>
    </section>
  );
}
