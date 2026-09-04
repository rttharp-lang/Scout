"use client";
import { useEffect, useRef, useState } from "react";
import type { Principle } from "@/content/types";
import { ScrollTrigger, useReducedMotion } from "@/lib/hooks";
import styles from "./codes.module.css";

/**
 * A code chapter: full-viewport interactive stage first, explanation second.
 * The explanation reveals when the interaction completes, or — for passive scrollers
 * and touch devices — once the chapter has been scrolled most of the way through.
 */
export default function Chapter({
  principle,
  children,
}: {
  principle: Principle;
  children: (api: { done: boolean; complete: () => void; progress: React.MutableRefObject<number>; reduced: boolean }) => React.ReactNode;
}) {
  const [done, setDone] = useState(false);
  const progress = useRef(0);
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setDone(true);
      return;
    }
    if (!ref.current) return;
    const st = ScrollTrigger.create({
      trigger: ref.current,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        progress.current = self.progress;
        if (self.progress > 0.72) setDone(true);
      },
    });
    return () => st.kill();
  }, [reduced]);

  return (
    <div className={`${styles.chapter} ${reduced ? styles.chapterStatic : ""}`} ref={ref} data-code={principle.id}>
      <div className={styles.stage}>
        <div className={`${styles.stageHead} t-mono`}>
          <span>CODE {principle.index}</span>
          <span className={styles.prompt} style={{ opacity: done ? 0 : 1 }}>
            {principle.prompt}
          </span>
        </div>
        {children({ done, complete: () => setDone(true), progress, reduced })}

        <div className={`${styles.reveal} ${done ? styles.revealOn : ""}`} aria-hidden={!done}>
          <p className={`t-mono ${styles.idx}`}>{principle.index}</p>
          <h3 className={`t-display ${styles.title}`}>{principle.title}</h3>
          <p className={`t-body ${styles.statement}`}>{principle.statement}</p>
          <p className={`t-body ${styles.explanation}`}>{principle.explanation}</p>
        </div>
      </div>
    </div>
  );
}
