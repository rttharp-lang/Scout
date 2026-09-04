"use client";
import { useEffect, useRef, useState } from "react";
import { season } from "@/content/season";
import type { World } from "@/content/types";
import { gsap, useGsap, useReducedMotion } from "@/lib/hooks";
import { useSound } from "@/components/system/SoundSystem";
import Placeholder from "@/components/system/Placeholder";
import styles from "./Act06Worlds.module.css";

/**
 * ACT 06 — FOUR WORLDS
 * One universe, four environments. On desktop the track moves sideways and each
 * world is a room you walk into; on touch they stack. Every world has its own
 * palette, typographic temperature and a different thing to do.
 */

function WorldFrame({ world, children, extraStyle }: { world: World; children: React.ReactNode; extraStyle?: React.CSSProperties }) {
  return (
    <article
      className={`${styles.world} ${styles[world.id]}`}
      data-world={world.id}
      style={{ "--w-bg": world.palette.bg, "--w-fg": world.palette.fg, "--w-accent": world.palette.accent, ...extraStyle } as React.CSSProperties}
      aria-label={`${world.title}: ${world.question}`}
    >
      <header className={`${styles.worldHead} t-mono`}>
        <span>WORLD {world.index}</span>
        <span className={styles.q}>{world.question}</span>
      </header>
      {children}
    </article>
  );
}

/* 01 FRANCHISES — three franchise blocks; hovering one reveals the enemy it was built to provoke. */
function Franchises({ world }: { world: World }) {
  const [hot, setHot] = useState<number | null>(null);
  const enemies = ["BUILT TO BE BOOED IN 29 BUILDINGS.", "THE COLOUR THE OTHER BENCH HATES.", "SIGNATURE ATTITUDE, NOT JUST SIGNATURE SHOE."];
  return (
    <WorldFrame world={world}>
      <h3 className={`${styles.worldTitle} t-display`} aria-hidden="true">
        {world.title}
      </h3>
      <div className={styles.franchiseRow}>
        {world.media.map((m, i) => (
          <button
            key={m.id}
            className={styles.franchise}
            onPointerEnter={() => setHot(i)}
            onPointerLeave={() => setHot(null)}
            onFocus={() => setHot(i)}
            onBlur={() => setHot(null)}
            onClick={() => setHot(hot === i ? null : i)}
            aria-pressed={hot === i}
            data-hot={hot === i}
            data-dim={hot !== null && hot !== i}
          >
            <Placeholder asset={m} className={styles.franchiseMedia} />
            <span className={`${styles.franchiseLabel} t-mono`}>FRANCHISE {String(i + 1).padStart(2, "0")}</span>
            <span className={`${styles.enemy} t-wide`}>{enemies[i]}</span>
          </button>
        ))}
      </div>
      <ul className={`${styles.provocations} t-body`}>
        {world.provocations.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </WorldFrame>
  );
}

/* 02 ATHLETES — a roster of names; each one recolours the room and rewrites the attitude. */
function Athletes({ world }: { world: World }) {
  const { athletes } = season;
  const [idx, setIdx] = useState(0);
  const a = athletes[idx];
  return (
    <WorldFrame world={world} extraStyle={{ "--w-bg": a.palette.bg, "--w-fg": a.palette.fg, "--w-accent": a.palette.accent } as React.CSSProperties}>
      <div className={styles.roster} role="tablist" aria-label="Athlete voices">
        {athletes.map((x, i) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={i === idx}
            className={`${styles.rosterName} t-display`}
            data-on={i === idx}
            onPointerEnter={() => setIdx(i)}
            onFocus={() => setIdx(i)}
            onClick={() => setIdx(i)}
          >
            {x.name}
          </button>
        ))}
      </div>
      <div className={styles.athleteSide}>
        <Placeholder asset={a.portrait} className={styles.athletePortrait} key={a.id} />
        <p className={`${styles.attitude} t-wide`} key={`${a.id}-line`}>
          {a.attitude}
        </p>
        <ul className={`${styles.provocations} t-body`}>
          {world.provocations.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </WorldFrame>
  );
}

/* 03 NBA — a scoreboard of rivalries; tap to cycle. The clock never stops. */
function NBA({ world }: { world: World }) {
  const { rivalries } = season;
  const [i, setI] = useState(0);
  const [clock, setClock] = useState("00:00.0");
  const { cue } = useSound();
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => {
      const t = ((performance.now() - start) / 1000) % 720;
      const rem = 720 - t;
      const m = Math.floor(rem / 60);
      const s = rem - m * 60;
      setClock(`${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`);
    }, 100);
    return () => window.clearInterval(id);
  }, []);
  const r = rivalries[i];
  return (
    <WorldFrame world={world}>
      <button
        className={styles.board}
        onClick={() => {
          setI((n) => (n + 1) % rivalries.length);
          cue("tick", 0.8);
        }}
        aria-label="Next rivalry"
      >
        <span className={`${styles.boardMeta} t-mono`}>
          <span>Q4</span>
          <span>{clock}</span>
          <span>RIVALRY {String(i + 1).padStart(2, "0")}</span>
        </span>
        <span className={styles.teams}>
          <span className={`${styles.team} t-display`} key={`a${i}`}>
            {r.a}
          </span>
          <span className={`${styles.vs} t-mono`}>VS</span>
          <span className={`${styles.team} ${styles.teamB} t-display`} key={`b${i}`}>
            {r.b}
          </span>
        </span>
        <span className={`${styles.boardLine} t-body`} key={`l${i}`}>
          {r.line}
        </span>
        <span className={`${styles.tap} t-mono`}>tap for the next one</span>
      </button>
      <div className={styles.nbaMedia}>
        {world.media.map((m) => (
          <Placeholder key={m.id} asset={m} />
        ))}
      </div>
      <ul className={`${styles.provocations} t-body`}>
        {world.provocations.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </WorldFrame>
  );
}

/* 04 WNBA — the walk. Drag the frames; the editorial reads as a tunnel, not a highlight reel. */
function WNBA({ world }: { world: World }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const pos = useRef(0);
  const apply = (v: number) => {
    const t = track.current;
    if (!t) return;
    const max = Math.max(0, t.scrollWidth - t.clientWidth);
    pos.current = Math.min(max, Math.max(0, v));
    t.style.transform = `translate3d(${-pos.current}px,0,0)`;
  };
  return (
    <WorldFrame world={world}>
      <h3 className={`${styles.worldTitle} ${styles.wnbaTitle} t-display`} aria-hidden="true">
        {world.title}
      </h3>
      <div
        className={styles.walk}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, start: pos.current };
        }}
        onPointerMove={(e) => drag.current && apply(drag.current.start - (e.clientX - drag.current.x))}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => Math.abs(e.deltaX) > Math.abs(e.deltaY) && apply(pos.current + e.deltaX)}
        tabIndex={0}
        role="group"
        aria-label="Tunnel walk, drag to move"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") apply(pos.current + 120);
          if (e.key === "ArrowLeft") apply(pos.current - 120);
        }}
      >
        <div className={styles.walkTrack} ref={track}>
          {world.media.map((m, i) => (
            <figure key={m.id} className={styles.frame} style={{ marginTop: `${(i % 2) * 8}vh` }}>
              <Placeholder asset={m} />
              <figcaption className={`${styles.frameCap} t-wide`}>{world.provocations[i % world.provocations.length]}</figcaption>
            </figure>
          ))}
          <figure className={`${styles.frame} ${styles.frameText}`}>
            <p className="t-display">EQUAL AMBITION. DIFFERENT WEAPON.</p>
          </figure>
        </div>
      </div>
      <p className={`${styles.walkHint} t-mono`}>drag · arrow keys</p>
    </WorldFrame>
  );
}

export default function Act06Worlds() {
  const { worlds } = season;
  const reduced = useReducedMotion();
  const scope = useGsap(
    (_, el) => {
      if (reduced) return;
      const mm = gsap.matchMedia();
      mm.add("(min-width: 900px)", () => {
        const track = el.querySelector<HTMLElement>("[data-track]")!;
        const n = worlds.length;
        gsap.to(track, {
          x: () => -(track.scrollWidth - window.innerWidth),
          ease: "none",
          scrollTrigger: {
            trigger: el.querySelector("[data-pin]") as HTMLElement,
            start: "top top",
            end: () => `+=${(n - 1) * 100}%`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
            snap: { snapTo: 1 / (n - 1), duration: { min: 0.2, max: 0.6 }, delay: 0.1, ease: "power2.inOut" },
          },
        });
      });
      return () => mm.revert();
    },
    [reduced, worlds.length]
  );

  return (
    <section id="act-worlds" className={`act ${styles.act}`} ref={scope} aria-label="Act 06 — Four Worlds" data-theme="dark">
      <header className={styles.intro}>
        <p className="t-mono">Act 06</p>
        <h2 className={`${styles.introTitle} t-display`}>Four worlds</h2>
        <p className={`${styles.introSub} t-body`}>One idea has to survive four rooms. It shouldn&apos;t look the same in any of them.</p>
      </header>
      <div className={styles.pin} data-pin>
        <div className={styles.track} data-track>
          <Franchises world={worlds[0]} />
          <Athletes world={worlds[1]} />
          <NBA world={worlds[2]} />
          <WNBA world={worlds[3]} />
        </div>
      </div>
    </section>
  );
}
