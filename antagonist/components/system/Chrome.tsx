"use client";
import { useEffect, useState } from "react";
import { season } from "@/content/season";
import { useSound } from "./SoundSystem";
import { useScroll } from "./SmoothScroll";
import { gsap, ScrollTrigger, useIsoLayoutEffect } from "@/lib/hooks";
import styles from "./Chrome.module.css";

/**
 * Minimal persistent interface: season mark, current act, sound toggle, progress line.
 * Deliberately small — the acts are the interface.
 */
export default function Chrome() {
  const { enabled, toggle } = useSound();
  const { scrollTo } = useScroll();
  const [act, setAct] = useState(season.chapters[0]);
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(true);

  useIsoLayoutEffect(() => {
    const ctx = gsap.context(() => {
      season.chapters.forEach((c) => {
        ScrollTrigger.create({
          trigger: `#act-${c.id}`,
          start: "top 50%",
          end: "bottom 50%",
          // Refresh after the acts' pins so the measured positions include pin spacers.
          refreshPriority: -10,
          onToggle: (self) => {
            if (self.isActive) {
              setAct(c);
              const el = document.getElementById(`act-${c.id}`);
              setDark(el?.dataset.theme !== "light");
            }
          },
        });
      });
      gsap.to(`.${styles.progress}`, {
        scaleX: 1,
        ease: "none",
        scrollTrigger: { start: 0, end: "max", scrub: 0.3, refreshPriority: -10 },
      });
    });
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <a className="skip-link t-mono" href="#act-reaction">
        Skip the tunnel
      </a>
      <header className={`${styles.chrome} ${dark ? "" : styles.light}`} data-chrome>
        <button className={`${styles.mark} t-mono`} onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-controls="act-index">
          <span className={styles.platform}>{season.meta.platform}</span>
          <span className={styles.dim}>{season.meta.chapter}</span>
          <span className={styles.dim}>{season.meta.season}</span>
        </button>

        <div className={`${styles.act} t-mono`} aria-live="polite">
          <span className={styles.dim}>ACT</span> {act.index} <span className={styles.slash}>/</span> {act.title}
        </div>

        <button className={`${styles.sound} t-mono`} onClick={toggle} aria-pressed={enabled} title="Toggle arena sound (M)">
          <span className={styles.bars} data-on={enabled}>
            <i />
            <i />
            <i />
            <i />
          </span>
          {enabled ? "SOUND ON" : "SOUND OFF"}
        </button>

        <div className={styles.progress} aria-hidden="true" />
      </header>

      <nav id="act-index" className={`${styles.index} ${menu ? styles.open : ""}`} aria-label="Acts" aria-hidden={!menu}>
        <ol>
          {season.chapters.map((c) => (
            <li key={c.id}>
              <button
                className="t-display"
                tabIndex={menu ? 0 : -1}
                onClick={() => {
                  setMenu(false);
                  scrollTo(`#act-${c.id}`);
                }}
              >
                <span className={`t-mono ${styles.idx}`}>{c.index}</span>
                {c.title}
              </button>
            </li>
          ))}
        </ol>
        <p className={`t-mono ${styles.foot}`}>
          {season.meta.division} · {season.meta.subtitle} · {season.meta.season}
        </p>
      </nav>
    </>
  );
}
