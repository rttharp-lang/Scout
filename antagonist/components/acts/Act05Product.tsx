"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { season } from "@/content/season";
import { gsap, ScrollTrigger, useGsap, useReducedMotion, useWebGL } from "@/lib/hooks";
import Placeholder from "@/components/system/Placeholder";
import type { ObjectState } from "@/components/webgl/GarmentScene";
import styles from "./Act05Product.module.css";

const GarmentScene = dynamic(() => import("@/components/webgl/GarmentScene"), { ssr: false });

/**
 * ACT 05 — PRODUCT TRANSLATION
 * The object stays. The lenses pass. Each lens rewrites the object, so the
 * design principle is seen on a form before it is read as a sentence.
 */
export default function Act05Product() {
  const { product, palette } = season;
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const [active, setActive] = useState(0);
  const stateRef = useRef<ObjectState>({ ...product.lenses[0].object });
  const pointerRef = useRef({ x: 0, y: 0, spin: 0 });
  const drag = useRef<{ x: number; spin: number } | null>(null);
  const [inView, setInView] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const scope = useGsap(
    (_, el) => {
      const lenses = el.querySelectorAll<HTMLElement>("[data-lens]");
      lenses.forEach((lens, i) => {
        ScrollTrigger.create({
          trigger: lens,
          start: "top 55%",
          end: "bottom 55%",
          onToggle: (self) => {
            if (self.isActive) {
              setActive(i);
              stateRef.current = { ...product.lenses[i].object };
            }
          },
        });
        if (!reduced) {
          gsap.from(lens.querySelectorAll("[data-in]"), {
            y: 40,
            opacity: 0,
            stagger: 0.08,
            duration: 0.9,
            scrollTrigger: { trigger: lens, start: "top 70%" },
          });
        }
      });
      ScrollTrigger.create({
        trigger: el,
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => setInView(self.isActive),
      });
      if (!reduced) {
        gsap.from(el.querySelectorAll("[data-intro] span"), {
          yPercent: 100,
          stagger: 0.15,
          duration: 1.1,
          ease: "power4.out",
          scrollTrigger: { trigger: el.querySelector("[data-intro]") as HTMLElement, start: "top 70%" },
        });
      }
    },
    [reduced, product.lenses]
  );

  // Pointer over the object: tilt; drag: spin.
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

  const lens = product.lenses[active];
  const objectColors = useMemo(
    () => ({ base: "#262624", accent: palette.accent, clash: palette.clash, paper: palette.paper }),
    [palette]
  );

  return (
    <section id="act-product" className={`act ${styles.act}`} ref={scope} aria-label="Act 05 — Product Translation" data-theme="light">
      <header className={styles.intro} data-intro>
        <p className="t-mono">Act 05 · Product translation</p>
        <h2 className={`${styles.introTitle} t-display`}>
          {product.intro.map((l, i) => (
            <span key={i} className={styles.clip}>
              <span>{l}</span>
            </span>
          ))}
        </h2>
        <p className={`${styles.introSub} t-body`}>
          Ten lenses. One object. Drag it. The object changes with every lens: nothing here is a final product, everything here is a direction.
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.stage} ref={stageRef} aria-hidden="true">
          {webgl && !reduced && inView ? (
            <GarmentScene stateRef={stateRef} pointerRef={pointerRef} colors={objectColors} />
          ) : (
            <div className={styles.fallback}>
              <div
                className={styles.fallbackForm}
                style={{
                  background: `linear-gradient(180deg, ${lens.object.hue > 0.5 ? palette.clash : lens.object.hue > 0.2 ? palette.accent : "#1c1c1b"} 0 58%, ${lens.object.hue > 0.2 ? palette.accent : "#1c1c1b"} 58%)`,
                  transform: `scaleX(${1 + lens.object.proportion * 0.25}) rotate(${lens.object.tilt * 8}deg)`,
                  outline: lens.object.trim > 0.5 ? `3px solid ${palette.accent}` : "none",
                }}
              />
            </div>
          )}
          <div className={`${styles.hud} t-mono`}>
            <span>OBJECT_01 · ABSTRACT FORM</span>
            <span>
              {String(active + 1).padStart(2, "0")} / {String(product.lenses.length).padStart(2, "0")} · {lens.title}
            </span>
            <span className={styles.hudHint}>drag to turn</span>
          </div>
          <div className={styles.readout} aria-hidden="true">
            {(Object.keys(lens.object) as (keyof ObjectState)[]).map((k) => (
              <span key={k} className="t-mono">
                <i style={{ transform: `scaleX(${Math.abs(lens.object[k])})` }} />
                {k}
              </span>
            ))}
          </div>
        </div>

        <ol className={styles.lenses}>
          {product.lenses.map((l, i) => (
            <li key={l.id} className={styles.lens} data-lens data-active={i === active}>
              <p className={`${styles.lensIdx} t-mono`} data-in>
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className={`${styles.lensTitle} t-display`} data-in>
                {l.title}
              </h3>
              <p className={`${styles.provocation} t-body`} data-in>
                {l.provocation}
              </p>
              <ul className={`${styles.possibilities} t-mono`} data-in>
                {l.possibilities.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <Placeholder asset={l.media} className={styles.media} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
