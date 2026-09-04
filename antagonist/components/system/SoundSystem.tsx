"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * Procedural arena ambience. No audio files: filtered noise for the crowd,
 * a low hum for the building, and short synthesised hits for flashes / boos.
 * Muted by default. Everything is created lazily on the first user toggle
 * so autoplay policies are respected.
 */

type Cue = "boo" | "flash" | "swell" | "cut" | "tick";

interface SoundCtx {
  enabled: boolean;
  toggle: () => void;
  cue: (name: Cue, intensity?: number) => void;
  /** 0..1 — crowd hostility. Drives the noise filter and volume. */
  setHostility: (v: number) => void;
}

const Ctx = createContext<SoundCtx>({ enabled: false, toggle: () => {}, cue: () => {}, setHostility: () => {} });
export const useSound = () => useContext(Ctx);

class Arena {
  ctx: AudioContext;
  master: GainNode;
  crowdGain: GainNode;
  crowdFilter: BiquadFilterNode;
  hum: OscillatorNode;
  humGain: GainNode;

  constructor() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // Crowd bed: brown-ish noise through a resonant bandpass.
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.crowdFilter = this.ctx.createBiquadFilter();
    this.crowdFilter.type = "bandpass";
    this.crowdFilter.frequency.value = 420;
    this.crowdFilter.Q.value = 0.6;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.35;
    src.connect(this.crowdFilter).connect(this.crowdGain).connect(this.master);
    src.start();

    // Building hum.
    this.hum = this.ctx.createOscillator();
    this.hum.type = "sine";
    this.hum.frequency.value = 52;
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.06;
    this.hum.connect(this.humGain).connect(this.master);
    this.hum.start();
  }

  fade(to: number, t = 0.6) {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(to, now, t / 3);
  }

  hostility(v: number) {
    const now = this.ctx.currentTime;
    this.crowdFilter.frequency.setTargetAtTime(380 + v * 900, now, 0.3);
    this.crowdGain.gain.setTargetAtTime(0.25 + v * 0.6, now, 0.3);
  }

  cue(name: Cue, k = 1) {
    const now = this.ctx.currentTime;
    if (name === "flash" || name === "tick") {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(name === "flash" ? 2400 : 900, now);
      o.frequency.exponentialRampToValueAtTime(name === "flash" ? 300 : 500, now + 0.06);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08 * k, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + (name === "flash" ? 0.09 : 0.04));
      o.connect(g).connect(this.master);
      o.start(now);
      o.stop(now + 0.1);
    } else if (name === "boo") {
      // Swell of the crowd bed with a dropped-pitch formant.
      this.crowdGain.gain.cancelScheduledValues(now);
      this.crowdGain.gain.setTargetAtTime(0.9 * k, now, 0.15);
      this.crowdGain.gain.setTargetAtTime(0.35, now + 0.9, 0.5);
      this.crowdFilter.frequency.setTargetAtTime(240, now, 0.1);
      this.crowdFilter.frequency.setTargetAtTime(420, now + 1.0, 0.6);
    } else if (name === "swell") {
      this.crowdGain.gain.setTargetAtTime(0.7 * k, now, 0.8);
    } else if (name === "cut") {
      this.crowdGain.gain.cancelScheduledValues(now);
      this.crowdGain.gain.setValueAtTime(0.0001, now);
      this.humGain.gain.setValueAtTime(0.0001, now);
      this.crowdGain.gain.setTargetAtTime(0.35, now + 2.5, 1.2);
      this.humGain.gain.setTargetAtTime(0.06, now + 2.5, 1.2);
    }
  }
}

export default function SoundSystem({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const arena = useRef<Arena | null>(null);
  const hostility = useRef(0);

  const toggle = useCallback(() => {
    setEnabled((on) => {
      const next = !on;
      if (next) {
        if (!arena.current) arena.current = new Arena();
        arena.current.ctx.resume();
        arena.current.fade(0.8);
        arena.current.hostility(hostility.current);
      } else {
        arena.current?.fade(0, 0.4);
      }
      return next;
    });
  }, []);

  const cue = useCallback(
    (name: Cue, k = 1) => {
      if (enabled && arena.current) arena.current.cue(name, k);
    },
    [enabled]
  );

  const setHostility = useCallback((v: number) => {
    hostility.current = v;
    arena.current?.hostility(v);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m" && !(e.target instanceof HTMLInputElement)) toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo(() => ({ enabled, toggle, cue, setHostility }), [enabled, toggle, cue, setHostility]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
