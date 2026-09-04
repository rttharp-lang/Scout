"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { season } from "@/content/season";
import { gsap, ScrollTrigger, useReducedMotion, useWebGL } from "@/lib/hooks";
import { useSound } from "@/components/system/SoundSystem";
import Placeholder from "@/components/system/Placeholder";
import type { ObjectState } from "@/components/webgl/GarmentScene";
import styles from "./Act05Product.module.css";

const GarmentScene = dynamic(() => import("@/components/webgl/GarmentScene"), { ssr: false });

/**
 * ACT 05 — PRODUCT TRANSLATION
 * The lights come on: a paper studio. One object arrives and never leaves.
 * Ten lenses are ten camera set-ups on the same body. Nothing scrolls past;
 * the camera moves, the title behind the object cuts, the annotations re-aim.
 */
const ANCHORS = [
  { x: 0.5, y: 0.28, left: true },
  { x: 0.63, y: 0.5, left: false },
  { x: 0.56, y: 0.76, left: false },
];

export default function Act05Product() {
  const { product, palette } = season;
  const lenses = product.lenses;
  const n = lenses.length;
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const { cue } = useSound();
  const [active, setActive] = useState(-1); // -1 = studio empty, intro line
  const [inView, setInView] = useState(false);
  const stateRef = useRef<ObjectState>({ ...lenses[0].object, present: 0 });
  const pointerRef = useRef({ x: 0, y: 0, spin: 0 });
  const drag = useRef<{ x: number; spin: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const prev = useRef(-2);

  const objectColors = useMemo(
    () => ({ base: "#262624", accent: palette.accent, clash: palette.clash, paper: palette.paper }),
    [palette]
  );

  useEffect(() => {
    if (!stageRef.current) return;
    // The section (not the pinned stage) is the reliable trigger for "are we anywhere near this".
    const io = ScrollTrigger.create({ trigger: sectionRef.current, start: "top bottom", end: "bottom top", onToggle: (s) => setInView(s.isActive), refreshPriority: -5 });
    if (reduced) {
      setActive(0);
      stateRef.current = { ...lenses[0].object, present: 1 };
      return () => io.kill();
    }
    const st = ScrollTrigger.create({
      trigger: stageRef.current,
      start: "top top",
      end: `+=${(n + 1) * 95}%`,
      pin: true,
      onUpdate: (self) => {
        const p = self.progress * (n + 1);
        const i = Math.min(n - 1, Math.floor(p) - 1); // first slot is the empty studio
        setActive(i);
        stateRef.current = i < 0 ? { ...lenses[0].object, present: 0 } : { ...lenses[i].object, present: 1 };
      },
    });
    return () => { st.kill(); io.kill(); };
  }, [n, lenses, reduced]);

  // The cut between set-ups: a short white pop, like a studio strobe.
  useEffect(() => {
    if (reduced || active === prev.current) return;
    const first = prev.current === -2;
    prev.current = active;
    if (first) return;
    if (flashRef.current) gsap.fromTo(flashRef.current, { opacity: active < 0 ? 0 : 0.9 }, { opacity: 0, duration: 0.25, ease: "power2.out" });
    cue("flash", 0.5);
  }, [active, reduced, cue]);

  // Pointer: tilt; drag: spin.
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    const move = (e: PointerEvent) => {
      const r = st.getBoundingClientRect();
      pointerRef.current.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pointerRef.current.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (drag.current) pointerRef.current.spin = drag.current.spin + (e.clientX - drag.current.x) * 0.012;
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-ui]")) return;
      drag.current = { x: e.clientX, spin: pointerRef.current.spin };
      st.setPointerCapture(e.pointerId);
    };
    const up = () => (drag.current = null);
    st.addEventListener("pointermove", move);
    st.addEventListener("pointerdown", down);
    st.addEventListener("pointerup", up);
    st.addEventListener("pointercancel", up);
    return () => {
      st.removeEventListener("pointermove", move);
      st.removeEventListener("pointerdown", down);
      st.removeEventListener("pointerup", up);
      st.removeEventListener("pointercancel", up);
    };
  }, []);

  const lens = lenses[Math.max(0, active)];
  const studioEmpty = active < 0;

  return (
    <section id="act-product" className={`act ${styles.act}`} ref={sectionRef} aria-label="Act 05 — Product Translation" data-theme="light">
      <div className={`pin-stage ${styles.studio} ${reduced ? styles.studioStatic : ""}`} ref={stageRef}>
        {/* Title on the back wall. The object stands in front of it. */}
        <div className={`${styles.wall} t-display`} aria-hidden="true">
          {lenses.map((l, i) => (
            <span key={l.id} style={{ visibility: i === active ? "visible" : "hidden" }}>{l.title}</span>
          ))}
        </div>

        {/* The intro line, alone in the empty studio. */}
        <h2 className={`${styles.intro} t-display`} style={{ visibility: studioEmpty || reduced ? "visible" : "hidden" }}>
          {product.intro.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </h2>

        <div className={styles.object} aria-hidden="true">
          {webgl && !reduced && inView ? (
            <GarmentScene stateRef={stateRef} pointerRef={pointerRef} colors={objectColors} />
          ) : (
            <div className={styles.fallback} style={{ opacity: studioEmpty ? 0 : 1 }}>
              <div
                className={styles.fallbackForm}
                style={{
                  background: `linear-gradient(180deg, ${lens.object.hue > 0.5 ? palette.clash : lens.object.hue > 0.2 ? palette.accent : "#262624"} 0 20%, ${lens.object.hue > 0.2 ? palette.accent : "#262624"} 20%)`,
                  transform: `scale(${1 + lens.object.zoom * 0.8}) scaleX(${1 + lens.object.proportion * 0.25}) rotate(${lens.object.tilt * 8}deg)`,
                  outline: lens.object.trim > 0.5 ? `3px solid ${palette.accent}` : "none",
                }}
              />
            </div>
          )}
        </div>

        {/* Set-up slate, top left, like a studio board. */}
        <div className={`${styles.slate} t-mono`} data-ui>
          <span>{studioEmpty ? "STUDIO · EMPTY" : `SET-UP ${String(active + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`}</span>
          <span className={styles.slateDim}>OBJECT_01 · ABSTRACT FORM · NOT A PRODUCT</span>
          <span className={styles.slateDim}>drag to turn</span>
        </div>

        {/* The lens: provocation and annotations aimed at the body. */}
        {!studioEmpty && (
          <div className={styles.lens} key={lens.id}>
            <p className={`${styles.provocation} t-body`}>{lens.provocation}</p>
            {lens.possibilities.map((p, i) => {
              const a = ANCHORS[i % ANCHORS.length];
              const left = a.left;
              return (
                <div
                  key={p}
                  className={`${styles.callout} ${left ? styles.calloutLeft : styles.calloutRight} t-mono`}
                  style={{ top: `${a.y * 100}%`, ["--ax" as string]: `${a.x * 100}%` }}
                >
                  <span className={styles.calloutLine} />
                  <span className={styles.calloutText}>{p}</span>
                </div>
              );
            })}
            <div className={styles.ref} data-ui>
              <Placeholder asset={lens.media} className={styles.refMedia} />
              <span className={`t-mono ${styles.refLabel}`}>REF · {lens.title}</span>
            </div>
          </div>
        )}

        <div className={styles.readout} aria-hidden="true">
          {(["proportion", "graphic", "hue", "grain", "trim", "mark", "layer"] as const).map((k) => (
            <span key={k} className="t-mono">
              <i style={{ transform: `scaleX(${studioEmpty ? 0 : Math.abs(lens.object[k])})` }} />
              {k}
            </span>
          ))}
        </div>

        <div className={styles.strobe} ref={flashRef} aria-hidden="true" />
      </div>

      {reduced && (
        <ol className={styles.staticList}>
          {lenses.map((l) => (
            <li key={l.id}>
              <h3 className="t-display">{l.title}</h3>
              <p className="t-body">{l.provocation}</p>
              <ul className="t-mono">{l.possibilities.map((p) => <li key={p}>{p}</li>)}</ul>
              <Placeholder asset={l.media} className={styles.refMedia} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
