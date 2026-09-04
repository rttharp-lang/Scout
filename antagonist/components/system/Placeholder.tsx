import type { CSSProperties } from "react";
import type { MediaAsset } from "@/content/types";
import { hashString, seeded } from "@/lib/utils";
import styles from "./Placeholder.module.css";

/**
 * Replaceable media slot.
 *
 * With `asset.src` it renders the real image / video.
 * Without it, a labelled procedural frame: abstract forms only, no borrowed imagery.
 * The `id` is printed on the frame so the team can find the slot in content/season.ts.
 */
export default function Placeholder({
  asset,
  className,
  style,
  priority,
}: {
  asset: MediaAsset;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
}) {
  const ratio = asset.ratio ?? "3 / 4";
  const merged: CSSProperties = { aspectRatio: ratio, ...style };

  if (asset.src) {
    return (
      <figure className={`${styles.slot} ${className ?? ""}`} style={merged} data-asset={asset.id}>
        {asset.kind === "video" ? (
          <video src={asset.src} poster={asset.poster} muted loop playsInline autoPlay preload={priority ? "auto" : "metadata"} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.src} alt={asset.alt ?? asset.label} loading={priority ? "eager" : "lazy"} decoding="async" />
        )}
      </figure>
    );
  }

  // Procedural composition, deterministic per id so SSR and client agree.
  const rnd = seeded(hashString(asset.id));
  const shapes = Array.from({ length: 3 }, (_, i) => ({
    x: 10 + rnd() * 60,
    y: 10 + rnd() * 60,
    w: 20 + rnd() * 50,
    h: 20 + rnd() * 60,
    r: (rnd() - 0.5) * 24,
    o: 0.35 + rnd() * 0.4,
    i,
  }));
  const treatment = asset.treatment ?? "grain";

  return (
    <figure
      className={`${styles.slot} ${styles.empty} ${styles[treatment]} ${className ?? ""}`}
      style={merged}
      data-asset={asset.id}
      role="img"
      aria-label={`Placeholder: ${asset.label}`}
    >
      <svg className={styles.form} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {shapes.map((s) => (
          <rect
            key={s.i}
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            transform={`rotate(${s.r} ${s.x + s.w / 2} ${s.y + s.h / 2})`}
            opacity={s.o}
          />
        ))}
        <line x1="0" y1="100" x2="100" y2="0" />
      </svg>
      <figcaption className={`t-mono ${styles.caption}`}>
        <span>{asset.label}</span>
        <span className={styles.id}>{asset.id}</span>
      </figcaption>
    </figure>
  );
}
