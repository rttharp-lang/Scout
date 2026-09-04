"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { season } from "@/content/season";
import { gsap, ScrollTrigger, useReducedMotion } from "@/lib/hooks";
import { useSound } from "@/components/system/SoundSystem";
import Chapter from "./codes/Chapter";
import { InterruptField, TargetHold, Friction, SecondLook, NeverNeutral } from "./codes/Interactions";
import styles from "./Act04Codes.module.css";

/**
 * ACT 04 — THE CREATIVE CODES
 * Out of the silence, straight into a room. Five codes, one room, hard cuts between
 * them: the camera doesn't scroll to the next code, it cuts. Each code is something
 * you do before it is something you read.
 */
export default function Act04Codes() {
  const { principles } = season;
  const n = principles.length;
  const reduced = useReducedMotion();
  const { cue } = useSound();
  const [active, setActive] = useState(0);
  const refs = useMemo(() => principles.map(() => ({ current: 0 })), [principles]);
  const stage = useRef<HTMLDivElement>(null);
  const shutter = useRef<HTMLDivElement>(null);
  const prev = useRef(0);

  useEffect(() => {
    if (reduced || !stage.current) return;
    const st = ScrollTrigger.create({
      trigger: stage.current,
      start: "top top",
      end: `+=${n * 170}%`,
      pin: true,
      onUpdate: (self) => {
        const p = self.progress * n;
        const i = Math.min(n - 1, Math.floor(p));
        refs[i].current = p - i;
        setActive(i);
      },
    });
    return () => st.kill();
  }, [n, reduced, refs]);

  // The cut: one black frame between codes.
  useEffect(() => {
    if (reduced || active === prev.current) return;
    prev.current = active;
    if (shutter.current) gsap.fromTo(shutter.current, { opacity: 1 }, { opacity: 0, duration: 0.18, ease: "power2.in" });
    cue("tick", 0.5);
  }, [active, reduced, cue]);

  return (
    <section id="act-codes" className={`act ${styles.act}`} aria-label="Act 04 — The Creative Codes" data-theme="dark">
      <div className={`pin-stage ${styles.room} ${reduced ? styles.roomStatic : ""}`} ref={stage}>
        {principles.map((p, i) => (
          <Chapter key={p.id} principle={p} active={i === active} progress={refs[i]} reduced={reduced}>
            {(api) => {
              switch (p.interaction) {
                case "interrupt": return <InterruptField api={api} />;
                case "target": return <TargetHold api={api} />;
                case "friction": return <Friction api={api} />;
                case "secondlook": return <SecondLook api={api} />;
                case "neutral": return <NeverNeutral api={api} />;
              }
            }}
          </Chapter>
        ))}
        <div className={`${styles.tally} t-mono`} aria-hidden="true">
          {principles.map((p, i) => (
            <i key={p.id} data-on={i <= active} />
          ))}
        </div>
        <div className={styles.shutter} ref={shutter} aria-hidden="true" />
      </div>
    </section>
  );
}
