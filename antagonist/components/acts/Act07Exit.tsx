"use client";
import { season } from "@/content/season";
import { gsap, ScrollTrigger, useGsap, useReducedMotion } from "@/lib/hooks";
import { useSound } from "@/components/system/SoundSystem";
import styles from "./Act07Exit.module.css";

/**
 * ACT 07 — EXIT
 * Everything is stripped. The lines arrive on their own clock, not the scroll's:
 * once you're here, you wait for them. That pause is the last piece of direction.
 */
export default function Act07Exit() {
  const { exit, meta } = season;
  const reduced = useReducedMotion();
  const { setHostility, cue } = useSound();

  const scope = useGsap(
    (_, el) => {
      if (reduced) return;
      const groups = el.querySelectorAll<HTMLElement>("[data-group]");
      const attitude = el.querySelector<HTMLElement>("[data-attitude]")!;
      const credit = el.querySelector<HTMLElement>("[data-credit]")!;
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });
      groups.forEach((g, i) => {
        const lines = g.querySelectorAll("span");
        tl.fromTo(lines, { opacity: 0, y: 14 }, { opacity: 1, y: 0, stagger: 0.35, duration: 0.6 }, i === 0 ? 0.6 : "+=1.4");
      });
      tl.to(groups, { opacity: 0, duration: 0.5 }, "+=1.8");
      tl.fromTo(attitude, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.05, onStart: () => cue("flash", 1) }, "+=0.4");
      tl.fromTo(credit, { opacity: 0 }, { opacity: 1, duration: 1.2 }, "+=1.2");

      ScrollTrigger.create({
        trigger: el,
        start: "top 30%",
        onEnter: () => {
          setHostility(0);
          tl.play(0);
        },
        onLeaveBack: () => tl.pause(0).progress(0),
      });
    },
    [reduced]
  );

  return (
    <section id="act-exit" className={`act ${styles.act} ${reduced ? styles.static : ""}`} ref={scope} aria-label="Act 07 — Exit" data-theme="dark">
      <div className={styles.stage}>
        {exit.lines.map((g, i) => (
          <p key={i} className={`${styles.group} t-display`} data-group>
            {g.map((l, j) => (
              <span key={j}>{l}</span>
            ))}
          </p>
        ))}
        <p className={`${styles.attitude} t-display`} data-attitude>
          {exit.attitude}
        </p>
        <footer className={`${styles.credit} t-mono`} data-credit>
          {exit.credit.map((c) => (
            <span key={c}>{c}</span>
          ))}
          <span className={styles.dim}>
            {meta.platform} / {meta.chapter} / {meta.season}
          </span>
        </footer>
      </div>
    </section>
  );
}
