"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { season } from "@/content/season";
import type { Archetype } from "@/content/types";
import { gsap, useGsap, useReducedMotion } from "@/lib/hooks";
import Placeholder from "@/components/system/Placeholder";
import { figureFor } from "@/lib/figure";
import styles from "./Act02Antagonist.module.css";

/**
 * ACT 02 — THE ANTAGONIST
 * One environment that keeps mutating. Each archetype takes over the room:
 * the tone, the silhouette, the ticker, the archive strip, the quote.
 * No cards. The name is the furniture.
 */

export default function Act02Antagonist() {
  const { archetypes } = season;
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [prev, setPrev] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const figRef = useRef<SVGPolygonElement>(null);
  const figWrap = useRef<HTMLDivElement>(null);
  const figures = useMemo(() => archetypes.map(figureFor), [archetypes]);
  const n = archetypes.length;

  const scope = useGsap(
    (_, el) => {
      if (reduced) return;
      const stage = el.querySelector("[data-stage]") as HTMLElement;
      gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: `+=${n * 110}%`,
          pin: stage,
          scrub: 0.4,
          onUpdate: (self) => {
            const p = self.progress;
            const i = Math.min(n - 1, Math.floor(p * n));
            setActive((cur) => {
              if (cur !== i) setPrev(cur);
              return i;
            });
            if (stripRef.current) {
              const w = stripRef.current.scrollWidth - window.innerWidth;
              stripRef.current.style.transform = `translate3d(${-p * w}px,0,0)`;
            }
          },
        },
      });
    },
    [reduced, n]
  );

  // Morph the figure, cut the name, when the archetype changes.
  useEffect(() => {
    if (!figRef.current) return;
    if (reduced) {
      figRef.current.setAttribute("points", figures[active]);
      return;
    }
    gsap.to(figRef.current, { attr: { points: figures[active] }, duration: 0.9, ease: "power4.inOut" });
    const nameEl = document.querySelector<HTMLElement>(`[data-name="${active}"]`);
    if (nameEl) {
      const letters = nameEl.querySelectorAll("span");
      gsap.fromTo(
        letters,
        { yPercent: 100, skewX: -12 },
        { yPercent: 0, skewX: 0, duration: 0.7, stagger: { each: 0.018, from: "random" }, ease: "power4.out", overwrite: true }
      );
    }
    const quote = document.querySelector<HTMLElement>(`[data-quote="${active}"]`);
    if (quote) gsap.fromTo(quote, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.5, delay: 0.35, overwrite: true });
    const tags = document.querySelectorAll<HTMLElement>(`[data-tags="${active}"] li`);
    gsap.fromTo(tags, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, delay: 0.5, overwrite: true });
  }, [active, figures, reduced]);

  // Pointer parallax on the figure.
  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      if (!figWrap.current) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      gsap.to(figWrap.current, { x: x * -22, y: y * -12, rotate: x * 1.5, duration: 1.2, ease: "power3.out" });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced]);

  const a = archetypes[active];

  if (reduced) {
    return (
      <section id="act-antagonist" className={`act ${styles.act}`} aria-label="Act 02 — The Antagonist" data-theme="dark">
        <div className={styles.staticList}>
          {archetypes.map((x, i) => (
            <article key={x.id} className={`${styles.staticItem} ${styles[`tone-${x.tone}`]}`}>
              <p className="t-mono">
                {String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
              </p>
              <h3 className="t-display">{x.name}</h3>
              <p className={`t-mono ${styles.ticker}`}>{x.headline}</p>
              <blockquote className="t-body">{x.quote}</blockquote>
              <ul className={`t-mono ${styles.tags}`}>{x.behaviors.map((b) => <li key={b}>{b}</li>)}</ul>
              <div className={styles.staticMedia}>
                <Placeholder asset={x.portrait} />
                {x.archive.map((m) => <Placeholder key={m.id} asset={m} />)}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id="act-antagonist" className={`act ${styles.act}`} ref={scope} aria-label="Act 02 — The Antagonist" data-theme="dark">
      <div className={`pin-stage ${styles.stage} ${styles[`tone-${a.tone}`]}`} data-stage>
        <div className={styles.tone} aria-hidden="true" />

        {/* Archive strip: drifts through the whole act, every archetype's archive passes by. */}
        <div className={styles.strip} ref={stripRef} aria-hidden="true">
          {archetypes.map((x, i) => (
            <div key={x.id} className={styles.stripGroup} data-dim={i !== active}>
              <Placeholder asset={x.portrait} className={styles.portrait} />
              {x.archive.map((m, j) => (
                <Placeholder key={m.id} asset={m} className={j % 2 ? styles.archiveLow : styles.archiveHigh} />
              ))}
              <span className={`t-mono ${styles.stripLabel}`}>
                ARCHIVE_{String(i + 1).padStart(3, "0")} · {x.id.toUpperCase()}
              </span>
            </div>
          ))}
        </div>

        {/* The figure */}
        <div className={styles.figure} ref={figWrap} aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet">
            <polygon ref={figRef} points={figures[0]} />
          </svg>
        </div>

        {/* The names: one giant, all pre-rendered so the cut is instant. */}
        <div className={styles.names}>
          {archetypes.map((x, i) => (
            <h3
              key={x.id}
              className={`${styles.name} t-display`}
              data-name={i}
              aria-hidden={i !== active}
              style={{ visibility: i === active ? "visible" : "hidden" }}
            >
              {x.name.split("").map((ch, k) => (
                <span key={k} style={{ display: ch === " " ? "inline" : "inline-block" }}>
                  {ch === " " ? " " : ch}
                </span>
              ))}
            </h3>
          ))}
        </div>

        {/* Broadcast ticker */}
        <div className={styles.tickerWrap} aria-live="polite">
          <div className={styles.tickerRow} key={a.id}>
            {[0, 1, 2].map((k) => (
              <span key={k} className={`t-mono t-mono--lg ${styles.ticker}`}>
                {a.headline}&nbsp;&nbsp;·&nbsp;&nbsp;
              </span>
            ))}
          </div>
        </div>

        {/* Scoreboard */}
        <div className={`${styles.score} t-mono`}>
          <span>{String(active + 1).padStart(2, "0")}</span>
          <span className={styles.scoreSlash}>/</span>
          <span>{String(n).padStart(2, "0")}</span>
          <span className={styles.scoreId}>{a.id}</span>
          <span className={styles.scorePrev}>prev {String(prev + 1).padStart(2, "0")}</span>
        </div>

        {/* Quote + behaviours */}
        <div className={styles.side}>
          {archetypes.map((x, i) => (
            <div key={x.id} style={{ display: i === active ? "block" : "none" }}>
              <blockquote className={`${styles.quote} t-body`} data-quote={i}>
                “{x.quote}”
              </blockquote>
              <ul className={`${styles.tags} t-mono`} data-tags={i}>
                {x.behaviors.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className={`${styles.note} t-mono`}>Archetypes, not categories. Athletes move between them.</p>
      </div>
    </section>
  );
}
