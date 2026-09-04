"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { season } from "@/content/season";
import type { World } from "@/content/types";
import { gsap, ScrollTrigger, useReducedMotion } from "@/lib/hooks";
import { useSound } from "@/components/system/SoundSystem";
import Placeholder from "@/components/system/Placeholder";
import styles from "./Act06Worlds.module.css";

/**
 * ACT 06 — FOUR WORLDS
 * One stage, four rooms. You don't scroll to the next one; the room changes:
 * the lights open on FRANCHISES, the page turns to ATHLETES, the buzzer cuts to
 * the NBA, the tunnel wipes into the WNBA. Inside each room, scroll moves the
 * argument (one provocation at a time) and the pointer does the exploring.
 */

function Room({ world, on, wipe, children, palette }: { world: World; on: boolean; wipe: string; children: React.ReactNode; palette?: World["palette"] }) {
  const p = palette ?? world.palette;
  return (
    <article
      className={`${styles.room} ${styles[wipe]} ${on ? styles.on : ""} ${styles[world.id]}`}
      data-world={world.id}
      style={{ "--w-bg": p.bg, "--w-fg": p.fg, "--w-accent": p.accent } as React.CSSProperties}
      aria-label={`${world.title}: ${world.question}`}
      aria-hidden={!on}
    >
      <header className={`${styles.head} t-mono`}>
        <span>WORLD {world.index}</span>
        <span className={styles.q}>{world.question}</span>
      </header>
      {children}
    </article>
  );
}

/** One provocation at a time, cut by scroll inside the room. */
function Argument({ world, local, className }: { world: World; local: number; className?: string }) {
  const i = Math.min(world.provocations.length - 1, Math.floor(local * world.provocations.length));
  return (
    <div className={`${styles.argument} ${className ?? ""}`} aria-live="polite">
      {world.provocations.map((p, k) => (
        <p key={p} className="t-display" style={{ visibility: k === i ? "visible" : "hidden" }}>
          {p}
        </p>
      ))}
      <span className={`${styles.argIdx} t-mono`}>
        {String(i + 1).padStart(2, "0")} / {String(world.provocations.length).padStart(2, "0")}
      </span>
    </div>
  );
}

/* 01 FRANCHISES — three blocks at three scales. Hovering one names the enemy it was built to provoke. */
function Franchises({ world, on, local }: { world: World; on: boolean; local: number }) {
  const [hot, setHot] = useState<number | null>(null);
  const enemies = ["BUILT TO BE BOOED IN 29 BUILDINGS.", "THE COLOUR THE OTHER BENCH HATES.", "SIGNATURE ATTITUDE, NOT JUST SIGNATURE SHOE."];
  return (
    <Room world={world} on={on} wipe="wipeLights">
      {world.media.map((m, i) => (
        <button
          key={m.id}
          className={`${styles.block} ${styles[`block${i}`]}`}
          onPointerEnter={() => setHot(i)}
          onPointerLeave={() => setHot(null)}
          onFocus={() => setHot(i)}
          onBlur={() => setHot(null)}
          onClick={() => setHot(hot === i ? null : i)}
          aria-pressed={hot === i}
          data-dim={hot !== null && hot !== i}
          tabIndex={on ? 0 : -1}
        >
          <Placeholder asset={m} className={styles.blockMedia} />
          <span className={`${styles.blockLabel} t-mono`}>FRANCHISE {String(i + 1).padStart(2, "0")}</span>
        </button>
      ))}
      <div className={`${styles.enemy} t-display`} aria-live="polite">
        {enemies.map((e, i) => (
          <span key={e} style={{ visibility: hot === i ? "visible" : "hidden" }}>{e}</span>
        ))}
      </div>
      <Argument world={world} local={local} />
      <p className={`${styles.hint} t-mono`} style={{ opacity: hot === null ? 0.6 : 0 }}>Touch a franchise.</p>
    </Room>
  );
}

/* 02 ATHLETES — the roster is the room. Each name recolours it and rewrites the line. */
function Athletes({ world, on, local }: { world: World; on: boolean; local: number }) {
  const { athletes } = season;
  const [idx, setIdx] = useState(0);
  const a = athletes[idx];
  return (
    <Room world={world} on={on} wipe="wipePage" palette={a.palette}>
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
            tabIndex={on ? 0 : -1}
          >
            {x.name}
          </button>
        ))}
      </div>
      <Placeholder asset={a.portrait} className={styles.athletePortrait} key={a.id} />
      <p className={`${styles.attitude} t-wide`} key={`${a.id}-line`}>{a.attitude}</p>
      <Argument world={world} local={local} className={styles.argumentSmall} />
    </Room>
  );
}

/* 03 NBA — the room is the scoreboard. Two walls, one clock, tap anywhere to change the rivalry. */
function NBA({ world, on, local }: { world: World; on: boolean; local: number }) {
  const { rivalries } = season;
  const [i, setI] = useState(0);
  const [clock, setClock] = useState("12:00.0");
  const { cue } = useSound();
  useEffect(() => {
    if (!on) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const rem = 720 - ((performance.now() - start) / 1000) % 720;
      const m = Math.floor(rem / 60);
      setClock(`${String(m).padStart(2, "0")}:${(rem - m * 60).toFixed(1).padStart(4, "0")}`);
    }, 100);
    return () => window.clearInterval(id);
  }, [on]);
  const r = rivalries[i];
  return (
    <Room world={world} on={on} wipe="wipeBuzzer">
      <button
        className={styles.board}
        onClick={() => { setI((n) => (n + 1) % rivalries.length); cue("tick", 0.8); }}
        aria-label={`Rivalry ${i + 1}: ${r.a} versus ${r.b}. Next rivalry`}
        tabIndex={on ? 0 : -1}
      >
        <span className={`${styles.teamA} t-display`} key={`a${i}`}>{r.a}</span>
        <span className={`${styles.teamB} t-display`} key={`b${i}`}>{r.b}</span>
        <span className={`${styles.clock} t-mono`}>
          <span className={styles.clockQ}>Q4</span>
          {clock}
        </span>
        <span className={`${styles.boardLine} t-body`} key={`l${i}`}>{r.line}</span>
        <span className={`${styles.tap} t-mono`}>RIVALRY {String(i + 1).padStart(2, "0")} · tap for the next</span>
      </button>
      <div className={styles.monitors} aria-hidden="true">
        {world.media.map((m) => <Placeholder key={m.id} asset={m} />)}
      </div>
      <Argument world={world} local={local} className={styles.argumentSmall} />
    </Room>
  );
}

/* 04 WNBA — the walk. Drag the frames; the editorial reads as a tunnel, not a highlight reel. */
function WNBA({ world, on, local }: { world: World; on: boolean; local: number }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const pos = useRef(0);
  const touched = useRef(false);
  const apply = (v: number) => {
    const t = track.current;
    if (!t) return;
    const max = Math.max(0, t.scrollWidth - t.clientWidth);
    pos.current = Math.min(max, Math.max(0, v));
    t.style.transform = `translate3d(${-pos.current}px,0,0)`;
  };
  // Until dragged, scroll walks the tunnel.
  useEffect(() => {
    if (touched.current || !track.current) return;
    apply(local * Math.max(0, track.current.scrollWidth - track.current.clientWidth));
  }, [local]);
  return (
    <Room world={world} on={on} wipe="wipeTunnel">
      <h3 className={`${styles.wnbaTitle} t-display`} aria-hidden="true">{world.title}</h3>
      <div
        className={styles.walk}
        onPointerDown={(e) => { touched.current = true; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, start: pos.current }; }}
        onPointerMove={(e) => drag.current && apply(drag.current.start - (e.clientX - drag.current.x))}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        tabIndex={on ? 0 : -1}
        role="group"
        aria-label="Tunnel walk, drag to move"
        onKeyDown={(e) => {
          touched.current = true;
          if (e.key === "ArrowRight") apply(pos.current + 120);
          if (e.key === "ArrowLeft") apply(pos.current - 120);
        }}
      >
        <div className={styles.walkTrack} ref={track}>
          {world.media.map((m, i) => (
            <figure key={m.id} className={styles.frame} style={{ marginTop: `${(i % 2) * 9}vh` }}>
              <Placeholder asset={m} />
              <figcaption className={`${styles.frameCap} t-wide`}>{world.provocations[i % world.provocations.length]}</figcaption>
            </figure>
          ))}
          <figure className={`${styles.frame} ${styles.frameText}`}>
            <p className="t-display">EQUAL AMBITION. DIFFERENT WEAPON.</p>
          </figure>
        </div>
      </div>
      <p className={`${styles.hint} t-mono`}>drag · arrow keys</p>
    </Room>
  );
}

export default function Act06Worlds() {
  const { worlds } = season;
  const n = worlds.length;
  const reduced = useReducedMotion();
  const { cue } = useSound();
  const [active, setActive] = useState(0);
  const [local, setLocal] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const buzzer = useRef<HTMLDivElement>(null);
  const prev = useRef(0);
  const lastLocalStep = useRef(-1);

  useEffect(() => {
    if (reduced || !stage.current) return;
    const st = ScrollTrigger.create({
      trigger: stage.current,
      start: "top top",
      end: `+=${n * 160}%`,
      pin: true,
      onUpdate: (self) => {
        const p = self.progress * n;
        const i = Math.min(n - 1, Math.floor(p));
        setActive(i);
        // Local progress at coarse steps so React only re-renders on real cuts.
        const step = Math.floor((p - i) * 24);
        if (step !== lastLocalStep.current) {
          lastLocalStep.current = step;
          setLocal(step / 24);
        }
      },
    });
    return () => st.kill();
  }, [n, reduced]);

  useEffect(() => {
    if (reduced || active === prev.current) return;
    prev.current = active;
    if (worlds[active].id === "nba" && buzzer.current) gsap.fromTo(buzzer.current, { opacity: 1 }, { opacity: 0, duration: 0.3, ease: "power3.out" });
    cue(worlds[active].id === "nba" ? "flash" : "tick", 0.7);
  }, [active, reduced, cue, worlds]);

  const isOn = (i: number) => reduced || i === active;
  const rooms = useMemo(() => worlds, [worlds]);

  return (
    <section id="act-worlds" className={`act ${styles.act}`} aria-label="Act 06 — Four Worlds" data-theme="dark">
      <div className={`pin-stage ${styles.stage} ${reduced ? styles.stageStatic : ""}`} ref={stage}>
        <Franchises world={rooms[0]} on={isOn(0)} local={active === 0 ? local : 0} />
        <Athletes world={rooms[1]} on={isOn(1)} local={active === 1 ? local : 0} />
        <NBA world={rooms[2]} on={isOn(2)} local={active === 2 ? local : 0} />
        <WNBA world={rooms[3]} on={isOn(3)} local={active === 3 ? local : 0} />
        <div className={styles.buzzer} ref={buzzer} aria-hidden="true" />
        <div className={`${styles.index} t-mono`} aria-hidden="true">
          {worlds.map((w, i) => (
            <span key={w.id} data-on={i === active}>{w.index}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
