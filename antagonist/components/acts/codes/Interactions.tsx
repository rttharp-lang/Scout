"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { gsap } from "@/lib/hooks";
import { useSound } from "@/components/system/SoundSystem";
import { clamp } from "@/lib/utils";
import styles from "./codes.module.css";

interface Api {
  done: boolean;
  complete: () => void;
  progress: React.MutableRefObject<number>;
  reduced: boolean;
}

/* ───────────────────────────── 01 INTERRUPT THE FIELD ─────────────────────────────
   A uniform field. The pointer is the interruption. Cells the pointer touches break
   out of the grid and stay broken for a beat; the last one stays for good. */
export function InterruptField({ api }: { api: Api }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ cols: 18, rows: 10 });
  const { cols, rows } = dims;
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const update = () => setDims(mq.matches ? { cols: 9, rows: 14 } : { cols: 18, rows: 10 });
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const broken = useRef(0);
  const touched = useRef(false);
  const { cue } = useSound();

  const breakAt = useCallback(
    (clientX: number, clientY: number, hard = false) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = Math.floor(((clientX - r.left) / r.width) * cols);
      const cy = Math.floor(((clientY - r.top) / r.height) * rows);
      const cell = el.children[cy * cols + cx] as HTMLElement | undefined;
      if (!cell || cell.dataset.broken) return;
      cell.style.setProperty("--rot", `${(Math.random() - 0.5) * 50}deg`);
      cell.dataset.broken = hard ? "2" : "1";
      broken.current++;
      if (broken.current % 6 === 0) cue("tick", 0.4);
      if (broken.current >= 14) api.complete();
      if (!hard) {
        window.setTimeout(() => {
          delete cell.dataset.broken;
        }, 900 + Math.random() * 600);
      }
    },
    [api, cue, cols, rows]
  );

  // Scroll fallback: a diagonal fracture runs through the field as the chapter scrolls.
  useEffect(() => {
    if (api.reduced) return;
    let raf = 0;
    let last = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (touched.current || !ref.current) return;
      const p = api.progress.current;
      const k = Math.floor(p * (cols + rows));
      if (k === last) return;
      last = k;
      const r = ref.current.getBoundingClientRect();
      for (let y = 0; y < rows; y++) {
        const x = k - y;
        if (x >= 0 && x < cols) breakAt(r.left + ((x + 0.5) / cols) * r.width, r.top + ((y + 0.5) / rows) * r.height);
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [api.progress, api.reduced, breakAt, cols, rows]);

  return (
    <>
      <div
        ref={ref}
        className={styles.grid}
        style={{ "--cols": cols, "--rows": rows } as React.CSSProperties}
        onPointerMove={(e) => {
          touched.current = true;
          breakAt(e.clientX, e.clientY);
        }}
        onPointerDown={(e) => {
          touched.current = true;
          breakAt(e.clientX, e.clientY, true);
        }}
        role="img"
        aria-label="A uniform grid that breaks where the pointer passes"
      >
        {Array.from({ length: cols * rows }, (_, i) => (
          <i key={i} className={styles.cell} />
        ))}
      </div>
      <p className={`${styles.fieldNote} t-mono`}>Click to leave it broken.</p>
    </>
  );
}

/* ───────────────────────────── 02 WEAR THE TARGET ─────────────────────────────
   The crosshair follows you. Press and hold anywhere and it locks onto the chest.
   The athlete doesn't flinch; the target becomes the graphic. */
export function TargetHold({ api }: { api: Api }) {
  const stage = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const chest = useRef<SVGRectElement>(null);
  const bar = useRef<HTMLElement>(null);
  const [locked, setLocked] = useState(false);
  const holdTween = useRef<gsap.core.Tween | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const holding = useRef(false);
  const { cue } = useSound();

  const chestPos = () => {
    const r = stage.current!.getBoundingClientRect();
    return { x: r.width / 2, y: r.height * 0.42 };
  };

  const moveRing = (x: number, y: number) => {
    if (!ring.current || holding.current) return;
    gsap.to(ring.current, { x, y, duration: 0.5, ease: "power3.out" });
  };

  const startHold = () => {
    if (holding.current || locked || !ring.current) return;
    holding.current = true;
    const c = chestPos();
    cue("swell", 0.6);
    holdTween.current?.kill();
    holdTween.current = gsap.to(ring.current, {
      x: c.x,
      y: c.y,
      scale: 0.7,
      duration: 1.1,
      ease: "power2.inOut",
      onUpdate: function () {
        if (bar.current) bar.current.style.transform = `scaleX(${this.progress()})`;
      },
      onComplete: () => {
        setLocked(true);
        api.complete();
        cue("flash", 1);
        if (chest.current) chest.current.style.opacity = "1";
        gsap.fromTo(stage.current, { backgroundColor: "#F2EFE9" }, { backgroundColor: "transparent", duration: 0.5 });
      },
    });
  };
  const endHold = () => {
    if (!holding.current) return;
    holding.current = false;
    if (locked) return;
    holdTween.current?.kill();
    gsap.to(ring.current, { x: pointer.current.x, y: pointer.current.y, scale: 1, duration: 0.5 });
    if (bar.current) gsap.to(bar.current, { scaleX: 0, duration: 0.3 });
  };

  useEffect(() => {
    // Scroll fallback: passive viewers still see the lock happen.
    if (api.reduced) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (api.progress.current > 0.5 && !locked && !holding.current) startHold();
    };
    loop();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, api.reduced]);

  return (
    <div
      ref={stage}
      className={styles.targetStage}
      tabIndex={0}
      role="button"
      aria-pressed={locked}
      aria-label="Press and hold to lock the target onto the athlete"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top };
        moveRing(pointer.current.x, pointer.current.y);
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top };
        startHold();
      }}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onPointerLeave={endHold}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          startHold();
        }
      }}
      onKeyUp={(e) => (e.key === " " || e.key === "Enter") && endHold()}
    >
      <div className={styles.figure} aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet">
          <polygon points="50,4 58,10 76,24 84,58 66,60 62,100 38,100 34,60 16,58 24,24 42,10" />
          <rect ref={chest} className={styles.chest} x="36" y="30" width="28" height="22" />
          <circle cx="50" cy="41" r="8" fill="none" stroke="#070707" strokeWidth="1.2" style={{ opacity: locked ? 1 : 0 }} />
          <circle cx="50" cy="41" r="3" fill="none" stroke="#070707" strokeWidth="1.2" style={{ opacity: locked ? 1 : 0 }} />
        </svg>
      </div>
      <div ref={ring} className={styles.ring} aria-hidden="true">
        <i className={styles.ringLine} />
        <i className={styles.ringLine} />
        <i className={styles.ringLine} />
        <i className={styles.ringLine} />
        {locked && <span className={`${styles.lock} t-mono`}>LOCKED · WORN</span>}
      </div>
      <div className={styles.holdBar} aria-hidden="true">
        <i ref={bar} />
      </div>
      <p className={`${styles.keyHint} t-mono`}>Hold pointer · hold space</p>
    </div>
  );
}

/* ───────────────────────────── 03 CREATE FRICTION ─────────────────────────────
   Two systems that don't belong together. Drag one into the other. The overlap is
   where the image gets interesting: inversion, jitter, sparks. Harmony is at rest. */
export function Friction({ api }: { api: Api }) {
  const stage = useRef<HTMLDivElement>(null);
  const a = useRef<HTMLParagraphElement>(null);
  const b = useRef<HTMLParagraphElement>(null);
  const dx = useRef(0);
  const drag = useRef<{ startX: number; startDx: number } | null>(null);
  const [f, setF] = useState(0);
  const userTouched = useRef(false);
  const { cue, setHostility } = useSound();

  const apply = useCallback(
    (v: number) => {
      const s = stage.current;
      if (!s || !a.current || !b.current) return;
      const w = s.clientWidth;
      v = clamp(v, -w, 0);
      dx.current = v;
      b.current.style.setProperty("--dx", `${v}px`);
      const ra = a.current.getBoundingClientRect();
      const rb = b.current.getBoundingClientRect();
      const overlap = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
      const fr = clamp(overlap / Math.min(ra.width, rb.width));
      setF(fr);
      s.style.setProperty("--f", fr.toFixed(3));
      setHostility(fr);
      if (fr > 0.55) {
        api.complete();
      }
    },
    [api, setHostility]
  );

  useEffect(() => {
    if (api.reduced) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (userTouched.current || !stage.current) return;
      const p = api.progress.current;
      const w = stage.current.clientWidth;
      apply(-clamp((p - 0.15) / 0.5) * w * 0.55);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [api.progress, api.reduced, apply]);

  const lastTick = useRef(0);
  useEffect(() => {
    if (f > 0.3 && performance.now() - lastTick.current > 220) {
      lastTick.current = performance.now();
      cue("tick", f);
    }
  }, [f, cue]);

  return (
    <div ref={stage} className={styles.frictionStage} style={{ "--f": 0 } as React.CSSProperties}>
      <div className={styles.spark} aria-hidden="true" />
      <p ref={a} className={`${styles.wordA} t-wide`} data-hot={f > 0.05} aria-hidden="true">
        {"PRECISION".split("").map((c, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.013}s` }}>
            {c}
          </span>
        ))}
      </p>
      <p
        ref={b}
        className={`${styles.wordB} t-display`}
        style={{ "--dx": "0px" } as React.CSSProperties}
        tabIndex={0}
        role="slider"
        aria-label="Drag CHAOS into PRECISION"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(f * 100)}
        onPointerDown={(e) => {
          userTouched.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { startX: e.clientX, startDx: dx.current };
        }}
        onPointerMove={(e) => drag.current && apply(drag.current.startDx + (e.clientX - drag.current.startX))}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          userTouched.current = true;
          const step = 40;
          if (e.key === "ArrowLeft") { e.preventDefault(); apply(dx.current - step); }
          if (e.key === "ArrowRight") { e.preventDefault(); apply(dx.current + step); }
        }}
      >
        CHAOS
      </p>
      <div className={`${styles.meter} t-mono`} aria-hidden="true">
        <span>HARMONY</span>
        <i />
        <span>FRICTION {Math.round(f * 100)}%</span>
      </div>
    </div>
  );
}

/* ───────────────────────────── 04 REWARD THE SECOND LOOK ─────────────────────────────
   A plain black garment. Your pointer is a light. Details only exist inside it:
   tonal print, seams, a label, a number. Hold to widen the beam. Find all three. */
export function SecondLook({ api }: { api: Api }) {
  const stage = useRef<HTMLDivElement>(null);
  const garment = useRef<HTMLDivElement>(null);
  const light = useRef<HTMLDivElement>(null);
  const [found, setFound] = useState([false, false, false]);
  const touched = useRef(false);
  const hold = useRef(false);
  const { cue } = useSound();
  const hotspots = [
    { x: 50, y: 42 },
    { x: 74, y: 84 },
    { x: 24, y: 86 },
  ];

  const setLight = useCallback(
    (clientX: number, clientY: number) => {
      const g = garment.current, s = stage.current;
      if (!g || !s) return;
      const r = g.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * 100;
      const y = ((clientY - r.top) / r.height) * 100;
      g.style.setProperty("--x", `${x}%`);
      g.style.setProperty("--y", `${y}%`);
      g.style.setProperty("--r", hold.current ? "38%" : "16%");
      const sr = s.getBoundingClientRect();
      if (light.current) light.current.style.transform = `translate(${clientX - sr.left}px, ${clientY - sr.top}px) scale(${hold.current ? 2.2 : 1})`;
      hotspots.forEach((h, i) => {
        if (Math.hypot(h.x - x, h.y - y) < (hold.current ? 22 : 12)) {
          setFound((f) => {
            if (f[i]) return f;
            const n = [...f];
            n[i] = true;
            cue("tick", 0.6);
            return n;
          });
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cue]
  );

  useEffect(() => {
    if (found.every(Boolean)) api.complete();
  }, [found, api]);

  useEffect(() => {
    if (api.reduced) {
      garment.current?.style.setProperty("--r", "200%");
      return;
    }
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (touched.current || !garment.current) return;
      const p = api.progress.current;
      // Sweep a figure-eight through the garment so passive viewers see the reveal.
      const t = p * Math.PI * 2.2;
      const r = garment.current.getBoundingClientRect();
      hold.current = p > 0.45;
      setLight(r.left + r.width * (0.5 + Math.sin(t) * 0.32), r.top + r.height * (0.5 + Math.sin(t * 2) * 0.36));
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [api.progress, api.reduced, setLight]);

  return (
    <div
      ref={stage}
      className={styles.lookStage}
      onPointerMove={(e) => {
        touched.current = true;
        setLight(e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        touched.current = true;
        hold.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setLight(e.clientX, e.clientY);
      }}
      onPointerUp={() => (hold.current = false)}
      onPointerCancel={() => (hold.current = false)}
      role="img"
      aria-label="A black garment revealing hidden details under a moving light"
    >
      <div ref={garment} className={styles.garment} style={{ "--x": "50%", "--y": "50%", "--r": "16%" } as React.CSSProperties}>
        <div className={styles.garmentPlain} />
        <div className={styles.details}>
          <i className={`${styles.seam} ${styles.seam1}`} />
          <i className={`${styles.seam} ${styles.seam2}`} />
          <p className={`${styles.tonal} t-display`}>NOBODY&apos;S FAVORITE</p>
          <span className={`${styles.label} t-mono`}>worn, not awarded</span>
          <span className={`${styles.number} t-display`}>00</span>
          {hotspots.map((h, i) => (
            <i key={i} className={styles.hotspot} style={{ left: `${h.x}%`, top: `${h.y}%` }} data-found={found[i]} />
          ))}
        </div>
      </div>
      <div ref={light} className={styles.light} aria-hidden="true" />
      <p className={`${styles.found} t-mono`} aria-label={`${found.filter(Boolean).length} of 3 details found`}>
        {found.map((f, i) => (
          <i key={i} data-on={f} />
        ))}
      </p>
      <p className={`${styles.keyHint} t-mono`}>Hold to look closer</p>
    </div>
  );
}

/* ───────────────────────────── 05 NEVER NEUTRAL ─────────────────────────────
   The word is already dissolving. There are two buttons and a third that isn't one.
   Choosing either floods the frame. Not choosing is not available. */
export function NeverNeutral({ api }: { api: Api }) {
  const [choice, setChoice] = useState<"hate" | "love" | null>(null);
  const { cue } = useSound();
  const pick = (c: "hate" | "love") => {
    setChoice(c);
    cue(c === "hate" ? "boo" : "swell", 1);
    api.complete();
  };
  return (
    <div className={styles.neutralStage}>
      <p className={`${styles.neutralWord} t-display`} aria-label="Neutral">
        {"NEUTRAL".split("").map((c, i) => (
          <span key={i} style={{ "--i": i } as React.CSSProperties}>
            {c}
          </span>
        ))}
      </p>
      <div className={styles.choices}>
        <button className={`${styles.choice} ${styles.choiceHate} t-display`} onClick={() => pick("hate")}>
          HATE IT
        </button>
        <button className={`${styles.noOpinion} t-mono`} disabled aria-disabled="true">
          NO OPINION
          <small>not available</small>
        </button>
        <button className={`${styles.choice} ${styles.choiceLove} t-display`} onClick={() => pick("love")}>
          LOVE IT
        </button>
      </div>
      <div
        className={`${styles.flood} ${choice ? styles.floodOn : ""}`}
        style={{ background: choice === "hate" ? "var(--accent)" : "var(--clash)", color: choice === "hate" ? "var(--ink)" : "var(--paper)" }}
        aria-live="polite"
      >
        <p className={`${styles.floodText} t-display`}>{choice ? "YOU REACTED." : ""}</p>
      </div>
    </div>
  );
}
