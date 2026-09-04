"use client";
import dynamic from "next/dynamic";
import { useRef } from "react";
import { season } from "@/content/season";
import { gsap, ScrollTrigger, useGsap, useReducedMotion, useWebGL } from "@/lib/hooks";
import { useSound } from "@/components/system/SoundSystem";
import type { TunnelHandle } from "@/components/webgl/TunnelCanvas";
import styles from "./Act00Tunnel.module.css";

const TunnelCanvas = dynamic(() => import("@/components/webgl/TunnelCanvas"), { ssr: false });

/**
 * ACT 00 — ENTRY / THE TUNNEL
 * Near-black. Noise enters. Everything cuts out. One statement. Then the name.
 * Scroll is the walk down the tunnel; the burst at the end is the door opening.
 */
export default function Act00Tunnel() {
  const { entry, palette } = season;
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const { cue, setHostility } = useSound();
  const handle = useRef<TunnelHandle>({ progress: 0, burst: 0, flicker: 0.3 });
  const fired = useRef(false);

  const scope = useGsap(
    (_, el) => {
      if (reduced) return;
      const words = el.querySelectorAll<HTMLElement>("[data-noise]");
      const lines = el.querySelectorAll<HTMLElement>("[data-line]");
      const reveal = el.querySelector<HTMLElement>("[data-reveal]");
      const hint = el.querySelector<HTMLElement>("[data-hint]");
      const flash = el.querySelector<HTMLElement>("[data-flash]");
      const noiseWrap = el.querySelector<HTMLElement>("[data-noise-wrap]");

      // Idle: the noise creeps in before the user does anything.
      gsap.fromTo(noiseWrap, { opacity: 0 }, { opacity: 1, duration: 2.4, ease: "power2.inOut", delay: 0.6 });
      gsap.fromTo(hint, { opacity: 0 }, { opacity: 0.7, duration: 1, delay: 2.2 });
      words.forEach((w, i) => {
        gsap.to(w, {
          opacity: "random(0.25, 1)",
          duration: 0.08,
          repeat: -1,
          repeatRefresh: true,
          repeatDelay: 0.15 + ((i * 37) % 9) / 10,
          delay: i * 0.1,
        });
      });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: "+=420%",
          pin: el.querySelector("[data-stage]") as HTMLElement,
          scrub: 0.6,
          onUpdate: (self) => {
            const p = self.progress;
            handle.current.progress = p;
            handle.current.flicker = 0.3 + p * 0.7;
            handle.current.burst = gsap.utils.clamp(0, 1, (p - 0.86) / 0.14);
            setHostility(p * 0.6);
            if (p > 0.9 && !fired.current) {
              fired.current = true;
              cue("flash", 1);
            }
            if (p < 0.8) fired.current = false;
          },
        },
      });

      // 0 → 0.35: noise gets louder and closer
      tl.to(words, { scale: 1.35, y: (i) => (i % 2 ? -40 : 40), stagger: { each: 0.01, from: "random" }, duration: 0.35 }, 0);
      tl.to(hint, { opacity: 0, duration: 0.05 }, 0.05);
      // 0.35 → 0.4: everything disappears
      tl.to(noiseWrap, { opacity: 0, duration: 0.04 }, 0.36);
      tl.set(words, { visibility: "hidden" }, 0.4);
      // 0.44 → 0.62: statement, line by line, cut not faded
      lines.forEach((l, i) => {
        tl.fromTo(l, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.02 }, 0.46 + i * 0.05);
      });
      // 0.62 → 0.72: pause (nothing moves)
      tl.to(lines, { opacity: 0, duration: 0.03, stagger: 0.005 }, 0.74);
      // 0.78 → 1: ANTAGONIST arrives from the dark and eats the frame
      tl.fromTo(reveal, { opacity: 0, scale: 0.7, letterSpacing: "0.1em" }, { opacity: 1, scale: 1, letterSpacing: "-0.03em", duration: 0.12 }, 0.78);
      tl.to(reveal, { scale: 2.6, duration: 0.1, ease: "power2.in" }, 0.9);
      tl.to(flash, { opacity: 1, duration: 0.05 }, 0.93);
      tl.to(reveal, { opacity: 0, duration: 0.02 }, 0.97);

      ScrollTrigger.refresh();
    },
    [reduced]
  );

  return (
    <section id="act-entry" className={`act ${styles.act}`} ref={scope} aria-label="Act 00 — The Tunnel" data-theme="dark">
      <div className={`pin-stage ${styles.stage} ${reduced ? styles.static : ""}`} data-stage>
        {webgl && !reduced ? <TunnelCanvas handle={handle} accent={palette.accent} /> : <div className={styles.cssTunnel} aria-hidden="true" />}

        <div className={styles.noise} data-noise-wrap aria-hidden={!reduced}>
          {entry.noise.map((f, i) => (
            <span
              key={i}
              className={`${styles.word} t-display`}
              data-noise
              style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, fontSize: `calc(${f.size ?? 1} * clamp(18px, 4vw, 96px))` }}
            >
              {f.text}
            </span>
          ))}
        </div>

        <h1 className={`${styles.statement} t-display`}>
          {entry.statement.map((l, i) => (
            <span key={i} data-line>
              {l}
            </span>
          ))}
        </h1>

        <div className={`${styles.reveal} t-display`} data-reveal aria-hidden="true">
          {entry.reveal}
        </div>
        <p className="sr-only">{entry.reveal}</p>

        <div className={styles.flash} data-flash aria-hidden="true" />

        <p className={`${styles.hint} t-mono`} data-hint>
          {entry.scrollHint}
          <span className={styles.hintLine} />
        </p>
      </div>
    </section>
  );
}
