"use client";
import { useMemo, useRef } from "react";
import { season } from "@/content/season";
import { gsap, useGsap, useReducedMotion } from "@/lib/hooks";
import { useSound } from "@/components/system/SoundSystem";
import { seeded } from "@/lib/utils";
import styles from "./Act03RageBait.module.css";

/**
 * ACT 03 — RAGE BAIT
 * Quiet insight → the machinery of reaction piles up until the frame can't hold it → hard cut to nothing.
 * The removal is the point. The silence after is where the line lands.
 */

const COMMENT_COUNT = 56;
const FLASH_COUNT = 16;

export default function Act03RageBait() {
  const { ragebait } = season;
  const reduced = useReducedMotion();
  const { cue, setHostility } = useSound();
  const counterRef = useRef<HTMLSpanElement>(null);
  const lastFlash = useRef(-1);
  const cutFired = useRef(false);

  const comments = useMemo(() => {
    const r = seeded(303);
    return Array.from({ length: COMMENT_COUNT }, (_, i) => ({
      text: ragebait.comments[i % ragebait.comments.length],
      handle: `@${["crt", "hoops", "fan", "seat", "row", "ref", "mod", "ohio", "nyc", "la", "atl", "chi"][Math.floor(r() * 12)]}_${Math.floor(r() * 9000 + 100)}`,
      x: 4 + r() * 80,
      y: 6 + r() * 82,
      rot: (r() - 0.5) * 14,
      size: 0.8 + r() * 0.9,
      t: Math.pow(i / COMMENT_COUNT, 1.7) * 0.82, // accelerates
      dark: r() > 0.7,
    }));
  }, [ragebait.comments]);

  const flashes = useMemo(() => {
    const r = seeded(77);
    return Array.from({ length: FLASH_COUNT }, (_, i) => ({
      x: r() * 100,
      y: r() * 100,
      s: 30 + r() * 60,
      t: 0.28 + (i / FLASH_COUNT) * 0.62 + r() * 0.02,
    }));
  }, []);

  const scope = useGsap(
    (_, el) => {
      if (reduced) return;
      const q = (s: string) => el.querySelectorAll<HTMLElement>(s);
      const stage = el.querySelector<HTMLElement>("[data-stage]")!;
      const title = el.querySelector<HTMLElement>("[data-title]")!;
      const ghosts = q("[data-ghost]");
      const peak = el.querySelector<HTMLElement>("[data-peak]")!;
      const all = el.querySelector<HTMLElement>("[data-all]")!;
      const wall = el.querySelector<HTMLElement>("[data-wall]")!;

      // Quiet part.
      gsap.from(q("[data-insight] p"), {
        opacity: 0,
        y: 30,
        stagger: 0.5,
        duration: 1.2,
        scrollTrigger: { trigger: el.querySelector("[data-insight]") as HTMLElement, start: "top 65%" },
      });
      gsap.from(q("[data-words] span"), {
        opacity: 0,
        x: -20,
        stagger: 0.06,
        duration: 0.3,
        ease: "power4.out",
        scrollTrigger: { trigger: el.querySelector("[data-words]") as HTMLElement, start: "top 70%" },
      });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: stage,
          start: "top top",
          end: "+=450%",
          pin: true,
          scrub: 0.35,
          onUpdate: (self) => {
            const p = self.progress;
            setHostility(Math.min(1, p * 1.3));
            // Counter
            if (counterRef.current) {
              const v = Math.floor(Math.pow(Math.min(p, 0.93) / 0.93, 2.4) * 4120882);
              counterRef.current.textContent = v.toLocaleString("en-US").padStart(9, "0");
            }
            // Flash cues
            let idx = -1;
            for (let i = 0; i < flashes.length; i++) if (flashes[i].t <= p) idx = i;
            if (idx !== lastFlash.current) {
              if (idx > lastFlash.current && p < 0.94) cue("flash", 0.5 + idx / flashes.length);
              lastFlash.current = idx;
            }
            // Shake
            if (p > 0.78 && p < 0.94) {
              const k = ((p - 0.78) / 0.16) * 6;
              wall.style.transform = `translate(${(Math.random() - 0.5) * k}px, ${(Math.random() - 0.5) * k}px)`;
            } else wall.style.transform = "";
            // Cut
            if (p >= 0.94 && !cutFired.current) {
              cutFired.current = true;
              cue("cut");
            }
            if (p < 0.9) cutFired.current = false;
          },
        },
      });

      // Title grows, then ghosts split off.
      tl.fromTo(title, { scale: 0.6, opacity: 0.6 }, { scale: 1.35, opacity: 1, duration: 0.9 }, 0);
      tl.fromTo(ghosts[0], { x: 0, opacity: 0 }, { x: -30, y: 10, opacity: 0.8, duration: 0.5 }, 0.35);
      tl.fromTo(ghosts[1], { x: 0, opacity: 0 }, { x: 34, y: -12, opacity: 0.8, duration: 0.5 }, 0.42);

      // Comments arrive, accelerating.
      q("[data-comment]").forEach((c, i) => {
        const t = comments[i].t;
        tl.fromTo(c, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.012 }, t);
        // late-arriving ones keep growing to crowd the frame
        if (i > COMMENT_COUNT * 0.6) tl.to(c, { scale: 1.6, duration: 0.2 }, t + 0.03);
      });

      // Camera flashes: hard on, quick off.
      q("[data-flash]").forEach((f, i) => {
        const t = flashes[i].t;
        tl.fromTo(f, { opacity: 0 }, { opacity: 1, duration: 0.004 }, t);
        tl.to(f, { opacity: 0, duration: 0.02 }, t + 0.004);
      });
      // Full-frame white at the last flashes.
      const white = el.querySelector<HTMLElement>("[data-white]")!;
      [0.86, 0.9, 0.925].forEach((t) => {
        tl.fromTo(white, { opacity: 0 }, { opacity: 0.9, duration: 0.004 }, t);
        tl.to(white, { opacity: 0, duration: 0.012 }, t + 0.004);
      });

      // Peak statement.
      tl.fromTo(peak, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.03 }, 0.8);
      tl.to(peak, { scale: 1.15, duration: 0.14 }, 0.83);

      // THE CUT. Everything gone at once. No fade.
      tl.set(all, { opacity: 0 }, 0.94);
      tl.set(stage, { backgroundColor: "#000" }, 0.94);

      // Silence.
      gsap.from(el.querySelector("[data-silence]"), {
        opacity: 0,
        duration: 2.4,
        ease: "power2.inOut",
        scrollTrigger: { trigger: el.querySelector("[data-silence-wrap]") as HTMLElement, start: "top 30%" },
      });
    },
    [reduced, comments, flashes]
  );

  return (
    <section id="act-ragebait" className={`act ${styles.act}`} ref={scope} aria-label="Act 03 — Rage Bait" data-theme="dark">
      <div className={styles.insight} data-insight>
        {ragebait.insight.map((l, i) => (
          <p key={i} className={`${styles.insightLine} t-display`}>
            {l}
          </p>
        ))}
      </div>

      <div className={`${styles.words} t-wide`} data-words>
        {ragebait.words.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className={`pin-stage ${styles.stage} ${reduced ? styles.static : ""}`} data-stage>
        <div className={styles.all} data-all>
          <div className={styles.wall} data-wall>
            <div className={`${styles.title} t-display`} data-title aria-hidden="true">
              {season.meta.chapter}
            </div>
            <div className={`${styles.title} ${styles.ghostA} t-display`} data-ghost aria-hidden="true">
              {season.meta.chapter}
            </div>
            <div className={`${styles.title} ${styles.ghostB} t-display`} data-ghost aria-hidden="true">
              {season.meta.chapter}
            </div>

            {comments.map((c, i) => (
              <div
                key={i}
                className={`${styles.comment} ${c.dark ? styles.commentDark : ""} t-mono`}
                data-comment
                style={{ left: `${c.x}%`, top: `${c.y}%`, transform: `rotate(${c.rot}deg)`, fontSize: `${c.size * 12}px` }}
                aria-hidden="true"
              >
                <span className={styles.handle}>{c.handle}</span> {c.text}
              </div>
            ))}

            {flashes.map((f, i) => (
              <div
                key={i}
                className={styles.flash}
                data-flash
                style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.s}vmin`, height: `${f.s}vmin` }}
                aria-hidden="true"
              />
            ))}

            <div className={`${styles.counter} t-mono`} aria-hidden="true">
              <span className={styles.counterLabel}>{ragebait.counterLabel}</span>
              <span ref={counterRef} className={styles.counterValue}>
                000,000,000
              </span>
            </div>

            <div className={`${styles.peak} t-display`} data-peak>
              {ragebait.peak}
            </div>
          </div>
          <div className={styles.white} data-white aria-hidden="true" />
        </div>
        {reduced && <p className="sr-only">{ragebait.peak}</p>}
      </div>

      <div className={styles.silenceWrap} data-silence-wrap>
        <p className={`${styles.silence} t-body`} data-silence>
          {ragebait.silence}
        </p>
      </div>
    </section>
  );
}
