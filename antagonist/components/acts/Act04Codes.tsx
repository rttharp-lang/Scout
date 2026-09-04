"use client";
import { season } from "@/content/season";
import { gsap, useGsap, useReducedMotion } from "@/lib/hooks";
import Chapter from "./codes/Chapter";
import { InterruptField, TargetHold, Friction, SecondLook, NeverNeutral } from "./codes/Interactions";
import styles from "./Act04Codes.module.css";

/**
 * ACT 04 — THE CREATIVE CODES
 * Five principles, each one an interaction first and a sentence second.
 */
export default function Act04Codes() {
  const { principles } = season;
  const reduced = useReducedMotion();
  const scope = useGsap(
    (_, el) => {
      if (reduced) return;
      gsap.from(el.querySelectorAll("[data-intro] > *"), {
        yPercent: 60,
        opacity: 0,
        stagger: 0.1,
        duration: 1,
        scrollTrigger: { trigger: el.querySelector("[data-intro]") as HTMLElement, start: "top 70%" },
      });
    },
    [reduced]
  );

  return (
    <section id="act-codes" className={`act ${styles.act}`} ref={scope} aria-label="Act 04 — The Creative Codes" data-theme="dark">
      <header className={styles.intro} data-intro>
        <p className="t-mono">Act 04</p>
        <h2 className={`${styles.title} t-display`}>The creative codes</h2>
        <p className={`${styles.sub} t-body`}>Five codes for product. Each one is something you do before it is something you read.</p>
      </header>

      {principles.map((p) => (
        <Chapter key={p.id} principle={p}>
          {(api) => {
            switch (p.interaction) {
              case "interrupt":
                return <InterruptField api={api} />;
              case "target":
                return <TargetHold api={api} />;
              case "friction":
                return <Friction api={api} />;
              case "secondlook":
                return <SecondLook api={api} />;
              case "neutral":
                return <NeverNeutral api={api} />;
            }
          }}
        </Chapter>
      ))}
    </section>
  );
}
