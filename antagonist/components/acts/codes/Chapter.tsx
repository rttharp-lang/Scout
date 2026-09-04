"use client";
import { useEffect, useRef, useState } from "react";
import type { Principle } from "@/content/types";
import styles from "./codes.module.css";

/**
 * One code inside the shared room. The interaction owns the whole stage; when it
 * completes (or the passive scroller has gone far enough), the code is stamped
 * across whatever the user made. No panel: the result stays visible under the words.
 */
export default function Chapter({
  principle,
  active,
  progress,
  reduced,
  children,
}: {
  principle: Principle;
  active: boolean;
  progress: React.MutableRefObject<number>;
  reduced: boolean;
  children: (api: { done: boolean; complete: () => void; progress: React.MutableRefObject<number>; reduced: boolean }) => React.ReactNode;
}) {
  const [done, setDone] = useState(reduced);
  const wasActive = useRef(false);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (active && progress.current > 0.7) setDone(true);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [active, progress, reduced]);

  useEffect(() => {
    if (active) wasActive.current = true;
  }, [active]);

  return (
    <div className={`${styles.chapter} ${reduced ? styles.chapterStatic : ""}`} data-code={principle.id} hidden={!active && !reduced}>
      <div className={`${styles.head} t-mono`}>
        <span className={styles.headIdx}>CODE {principle.index}</span>
        <span className={styles.prompt} style={{ opacity: done ? 0 : 1 }}>{principle.prompt}</span>
      </div>

      {(active || reduced || wasActive.current) && children({ done, complete: () => setDone(true), progress, reduced })}

      <div className={`${styles.stamp} ${done ? styles.stampOn : ""}`} aria-hidden={!done}>
        <span className={`${styles.stampIdx} t-display`}>{principle.index}</span>
        <h3 className={`${styles.stampTitle} t-display`}>{principle.title}</h3>
      </div>
      <div className={`${styles.caption} ${done ? styles.captionOn : ""}`} aria-hidden={!done}>
        <p className={`t-body ${styles.statement}`}>{principle.statement}</p>
        <p className={`t-body ${styles.explanation}`}>{principle.explanation}</p>
      </div>
    </div>
  );
}
