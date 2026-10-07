// Mascot Lab — Studio logo panel: the logo on a checkerboard, upload, background
// removal (toggle, tolerance, hold-to-compare), team name and team colors, samples.
// Desktop: a sticky sidebar of quiet groups split by hairlines. Tablet and phone
// (`collapsible`): a team bar (logo, name, colors, Upload) that opens the same groups.
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Check, ChevronDown, Eye, RotateCcw, Upload } from "lucide-react";
import {
  Button, CanvasImage, ColorField, Field, IconButton, Input, Notice, Slider, SpecLabel, Spinner, Toggle, cx, inkFor,
} from "../components/index.js";
import { DEFAULT_TOLERANCE, logoKey } from "../../state/store.jsx";
import { getLogoCanvas } from "../../state/useLogoCanvas.js";
import { SAMPLE_LOGOS, getSample } from "../../assets/samples/index.js";
import { extractPalette, suggestPalette } from "../../engine/image.js";
import { resizeCanvas } from "../../engine/core.js";
import { scheduler } from "./renderKit.js";

const ROLE_FIELDS = [
  { role: "primary", label: "Primary" },
  { role: "secondary", label: "Secondary" },
  { role: "accent", label: "Accent" },
];

// "the same colors" within a small tolerance: the upload flow suggests colors from a
// 640 px copy and this panel from a 480 px one, so exact hex matches would flag a
// fresh upload as already edited
const rgbOf = (h) => { const n = parseInt(String(h || "").replace("#", "").slice(0, 6), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const near = (a, b) => { const x = rgbOf(a), y = rgbOf(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) <= 24; };
const samePalette = (a, b) => !!a && !!b && ["primary", "secondary", "accent"].every((r) => near(a[r], b[r]));

/* ───────────── derived data, memoized per decoded logo ───────────── */

const colorMemo = new Map();
function logoColors(canvas, key) {
  if (!canvas || !key) return null;
  if (colorMemo.has(key)) return colorMemo.get(key);
  let out = null;
  try {
    // a 480 px copy carries the same inks at a fraction of the pixel reads
    const long = Math.max(canvas.width, canvas.height);
    if (long > 480) canvas = resizeCanvas(canvas, (canvas.width * 480) / long, (canvas.height * 480) / long);
    const sw = extractPalette(canvas, 6, { maxSamples: 12000 }).filter((c) => c.weight >= 0.015).map((c) => c.hex.toUpperCase());
    const sugg = suggestPalette(canvas);
    out = { swatches: [...new Set(sw)], suggested: sugg };
  } catch (e) {
    console.warn("[studio] logo colors:", e?.message || e);
    out = { swatches: [], suggested: null };
  }
  colorMemo.set(key, out);
  if (colorMemo.size > 8) colorMemo.delete(colorMemo.keys().next().value);
  return out;
}

/** useLogoColors(logo) → { swatches: [hex], suggested: palette } once the page is idle. */
function useLogoColors(logo) {
  const [res, setRes] = useState(() => colorMemo.get(logo.key) || null);
  useEffect(() => {
    if (!logo.canvas || !logo.key) return undefined;
    if (colorMemo.has(logo.key)) { setRes(colorMemo.get(logo.key)); return undefined; }
    // through the render queue (low priority) so it never competes with visible tiles
    const t = scheduler.request(`colors|${logo.key}`, async () => logoColors(logo.canvas, logo.key), 25);
    let alive = true;
    t.promise.then((r) => alive && setRes(r), () => {});
    return () => { alive = false; t.release(); };
  }, [logo.canvas, logo.key]);
  return res;
}

/** useOriginalLogo(logoState, enabled) → the logo decoded WITHOUT background removal (for the peek). */
function useOriginalLogo(logoState, enabled) {
  const [canvas, setCanvas] = useState(null);
  const raw = useMemo(() => {
    const l = { ...logoState, bgRemoved: false };
    return { ...l, key: logoKey(l) };
  }, [logoState]);
  useEffect(() => {
    setCanvas(null);
    if (!enabled) return undefined;
    let alive = true;
    const t = scheduler.request(`orig|${raw.key}`, () => getLogoCanvas(raw), -1);
    t.promise.then((r) => alive && setCanvas(r.canvas), () => {});
    return () => { alive = false; t.release(); };
  }, [raw, enabled]);
  return canvas;
}

/* ───────────────────────────── panel ───────────────────────────── */

export function LogoPanel({ state, actions, logo, upload, collapsible = false, onToast }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef(null);
  const close = () => {
    setOpen(false);
    // the panel can be taller than the screen: bring the summary (and the gallery under it) back
    requestAnimationFrame(() => {
      const el = toggleRef.current;
      if (!el) return;
      if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "auto" });
      el.focus({ preventScroll: true });
    });
  };
  const bodyId = useId();
  const isSample = !!state.logo.sampleId;
  const sample = isSample ? getSample(state.logo.sampleId) : null;
  const teamName = [state.team.school, state.team.mascot].filter(Boolean).join(" ") || "Your team";
  const expanded = !collapsible || open;
  const prompt = useNamePrompt(state, isSample);
  const namePrompt = prompt.on ? <NamePrompt state={state} actions={actions} onDone={prompt.done} /> : null;

  return (
    <section className={cx("st-logo", collapsible && "st-logo--collapsible", expanded && "is-open")} aria-label="Logo and team">
      {collapsible && (
        <div className="st-logo__summary">
          <button
            ref={toggleRef}
            type="button"
            className="st-logo__toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="st-logo__thumb" aria-hidden="true">
              {logo.canvas ? <CanvasImage canvas={logo.canvas} ratio={1} padding={0.06} alt="" /> : <Spinner />}
            </span>
            <span className="st-logo__sumtext">
              <span className="st-logo__sumname">{teamName}</span>
              <span className="st-logo__summeta">
                <span className="st-dots" aria-hidden="true">
                  <i style={{ background: state.palette.primary }} />
                  <i style={{ background: state.palette.secondary }} />
                  <i style={{ background: state.palette.accent }} />
                </span>
                {isSample ? <SpecLabel variant="box" className="st-tag">Sample logo</SpecLabel> : <span className="st-logo__fname">{state.logo.name}</span>}
              </span>
            </span>
            <span className="st-logo__edit">
              <span>{open ? "Done" : "Edit logo"}</span>
              <ChevronDown aria-hidden="true" />
            </span>
          </button>
          {!open && (
            <Button variant="secondary" size="sm" icon={<Upload aria-hidden="true" />} loading={upload.busy} onClick={upload.openPicker}>
              Upload
            </Button>
          )}
        </div>
      )}
      {collapsible && !open && namePrompt && <div className="st-logo__prompt">{namePrompt}</div>}

      <div className="st-logo__body" id={bodyId} hidden={!expanded}>
        <LogoCard state={state} actions={actions} logo={logo} upload={upload} isSample={isSample} sample={sample} onToast={onToast} namePrompt={expanded ? namePrompt : null} />
        {!namePrompt && <TeamNames state={state} actions={actions} />}
        <TeamColors state={state} actions={actions} logo={logo} sample={sample} />
        <Samples state={state} actions={actions} />
        {collapsible && (
          <div className="st-logo__done">
            <Button variant="secondary" block onClick={close}>Done</Button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────── logo card: preview, file, upload, background ───────────── */

function LogoCard({ state, actions, logo, upload, isSample, sample, onToast, namePrompt = null }) {
  const setting = state.logo.bgRemoved;
  const info = logo.info;
  const decoding = logo.status === "loading";
  const removed = !!info?.bgRemoved;
  const hadAlpha = !!info?.hadAlpha;
  const requested = setting === true || (setting === "auto" && !hadAlpha);
  const [tol, setTol] = useState(state.logo.tolerance ?? DEFAULT_TOLERANCE);
  useEffect(() => setTol(state.logo.tolerance ?? DEFAULT_TOLERANCE), [state.logo.tolerance]);
  const commitTimer = useRef(0);
  const commitTol = (v) => {
    clearTimeout(commitTimer.current);
    if (v !== state.logo.tolerance) actions.setLogo({ tolerance: v, bgRemoved: setting === false ? true : setting });
  };
  useEffect(() => () => clearTimeout(commitTimer.current), []);

  const [peeking, setPeeking] = useState(false);
  const original = useOriginalLogo(state.logo, removed && !decoding);
  const showOriginal = peeking && original;

  let status;
  if (decoding) status = "Updating the cut-out…";
  else if (!info) status = "";
  else if (!requested) status = hadAlpha && setting === "auto" ? "This logo is already transparent." : "Background kept as uploaded.";
  else if (removed) status = "Background removed. Check the edges in the preview.";
  else status = hadAlpha ? "Already transparent. Nothing to remove." : "No solid background at the edges, so nothing was removed.";

  const size = info ? `${info.width} × ${info.height} px` : null;

  const peekProps = {
    onPointerDown: (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setPeeking(true); },
    onPointerUp: () => setPeeking(false),
    onPointerCancel: () => setPeeking(false),
    onPointerLeave: () => setPeeking(false),
    onKeyDown: (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); setPeeking(true); } },
    onKeyUp: (e) => { if (e.key === " " || e.key === "Enter") setPeeking(false); },
    onBlur: () => setPeeking(false),
    onContextMenu: (e) => e.preventDefault(),
  };

  return (
    <div className="st-group st-logocard">
      <div className="ml-panel__head">
        <span className="ml-panel__title">Logo</span>
        {isSample && <SpecLabel variant="box" className="st-tag">Sample logo</SpecLabel>}
      </div>
      <div className={cx("st-logocard__preview", "ml-stage--checker", showOriginal && "is-original")}>
        <CanvasImage
          canvas={showOriginal ? original : logo.canvas}
          ratio={1}
          padding={0.08}
          alt={showOriginal ? "Your logo as uploaded, before background removal" : `${state.logo.name || "Logo"}, background ${removed ? "removed" : "as uploaded"}`}
          loading={decoding || upload.busy}
          error={logo.status === "error" && !logo.canvas ? "Couldn't read this logo" : null}
        />
        {showOriginal && <span className="st-logocard__flag">Original</span>}
      </div>
      <div className="st-logocard__file">
        <span className="st-logocard__name" title={state.logo.name}>{isSample ? sample?.name || state.logo.name : state.logo.name || "Your logo"}</span>
        {!isSample && size && <span className="t-meta st-logocard__size">{size}</span>}
      </div>
      {namePrompt}
      <div className="st-logocard__upload">
        <Button block variant={isSample ? "primary" : "secondary"} icon={<Upload aria-hidden="true" />} loading={upload.busy} onClick={upload.openPicker}>
          {isSample ? "Upload your logo" : "Replace logo"}
        </Button>
        <p className="st-hint">PNG, JPG, SVG or WebP up to 15 MB.<span className="st-hint__more"> Or drop a file anywhere on this page, or paste an image.</span></p>
      </div>
      {upload.error && (
        <Notice tone="danger" title="That file didn't work" onDismiss={upload.clearError}>{upload.error}</Notice>
      )}
      {logo.status === "error" && (
        <Notice tone="danger" title="We couldn't read this logo">
          {String(logo.error?.message || "Upload it again, or try a PNG export.")}
        </Notice>
      )}

      <div className="st-bg">
        <Toggle
          block
          checked={requested}
          disabled={decoding && !info}
          label="Remove background"
          description={status}
          onChange={(on) => {
            actions.setLogo({ bgRemoved: on });
            if (!on && removed) onToast?.({ title: "Background kept", body: "Your logo is back to the file as uploaded.", tone: "info" });
          }}
        />
        {requested && !hadAlpha && (
          <div className="st-bg__tune">
            <Slider
              label="Edge tolerance"
              min={4}
              max={90}
              step={1}
              value={tol}
              onChange={(v) => {
                setTol(v);
                clearTimeout(commitTimer.current);
                commitTimer.current = setTimeout(() => commitTol(v), 700);
              }}
              onCommit={commitTol}
              hint="Raise it if a halo of background is left. Lower it if parts of the logo disappear."
            />
            {removed && (
              <button type="button" className={cx("st-peek", peeking && "is-on")} aria-pressed={peeking} {...peekProps}>
                <Eye aria-hidden="true" />
                <span>{original ? "Hold to see the original" : "Loading the original…"}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── team names ───────────────────────────── */

// "Later" on the name prompt holds for this logo until the page reloads
let promptDismissedFor = null;

/**
 * useNamePrompt(state, isSample) → { on, done(later) }. An upload clears the sample's
 * team name; when an uploaded logo arrives (or the Studio opens on one) with the school
 * and mascot both blank, the logo panel asks for them inline (highlighted fields, nothing
 * blocking). It stays up while the coach types and ends when focus leaves it with a name
 * in, or on "Later". Clearing the names by hand later doesn't swap the fields under the
 * cursor: only a new logo (or a fresh visit) asks again.
 */
function useNamePrompt(state, isSample) {
  const blank = !String(state.team.school || "").trim() && !String(state.team.mascot || "").trim();
  const needs = !isSample && blank;
  const key = state.logo.src; // the uploaded file itself (logo.key also changes with background settings)
  const [on, setOn] = useState(() => needs && promptDismissedFor !== key);
  const seenKey = useRef(key);
  useEffect(() => {
    if (seenKey.current === key) return; // same logo: the name fields stay where they are
    seenKey.current = key;
    setOn(needs && promptDismissedFor !== key);
  }, [needs, key]);
  const done = (later) => {
    if (later) promptDismissedFor = key;
    setOn(false);
  };
  return { on: on && !isSample, done };
}

/** NamePrompt — the inline "Name your team" fields shown after an upload. */
function NamePrompt({ state, actions, onDone }) {
  const id = useId();
  const named = () => !!(String(state.team.school || "").trim() || String(state.team.mascot || "").trim());
  return (
    <div
      className="st-nameprompt"
      role="group"
      aria-labelledby={`${id}-h`}
      aria-describedby={`${id}-d`}
      onBlur={(e) => {
        // done once a name is in and focus leaves the prompt
        if (!e.currentTarget.contains(e.relatedTarget) && named()) onDone(false);
      }}
    >
      <div className="st-nameprompt__head">
        <span className="st-nameprompt__title" id={`${id}-h`}>Name your team</span>
        <button type="button" className="st-nameprompt__later" onClick={() => onDone(true)}>Later</button>
      </div>
      <p className="st-hint" id={`${id}-d`}>Your school and mascot go on the line sheet, the file names and the order.</p>
      <div className="st-names">
        <Field label="School">
          <Input
            value={state.team.school}
            placeholder="e.g. Lincoln High"
            autoComplete="organization"
            maxLength={40}
            onChange={(e) => actions.setTeam({ school: e.target.value })}
          />
        </Field>
        <Field label="Mascot">
          <Input
            value={state.team.mascot}
            placeholder="e.g. Eagles"
            maxLength={30}
            onChange={(e) => actions.setTeam({ mascot: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function TeamNames({ state, actions }) {
  return (
    <div className="st-group st-teamnames">
      <div className="ml-panel__head"><span className="ml-panel__title">Team name</span></div>
      <div className="st-names">
        <Field label="School">
          <Input
            value={state.team.school}
            placeholder="e.g. Northgate"
            autoComplete="organization"
            maxLength={40}
            onChange={(e) => actions.setTeam({ school: e.target.value })}
          />
        </Field>
        <Field label="Mascot">
          <Input
            value={state.team.mascot}
            placeholder="e.g. Bulldogs"
            maxLength={30}
            onChange={(e) => actions.setTeam({ mascot: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

/* ───────────────────────────── team colors ───────────────────────────── */

function TeamColors({ state, actions, logo, sample }) {
  const [active, setActive] = useState("primary");
  const colors = useLogoColors(logo);
  const suggested = sample?.palette || colors?.suggested || null;
  const swatches = useMemo(() => {
    const list = [...(colors?.swatches || [])];
    if (sample) for (const r of ["primary", "secondary", "accent"]) list.push(String(sample.palette[r]).toUpperCase());
    return [...new Set(list)].slice(0, 6);
  }, [colors, sample]);
  const atSuggestion = suggested ? samePalette(state.palette, suggested) : true;
  const activeField = ROLE_FIELDS.find((r) => r.role === active) || ROLE_FIELDS[0];

  return (
    <div className="st-group st-colors">
      <div className="ml-panel__head">
        <span className="ml-panel__title">Team colors</span>
        <IconButton
          size="sm"
          label="Swap primary and secondary"
          icon={<ArrowUpDown aria-hidden="true" />}
          onClick={() => actions.setPalette({ primary: state.palette.secondary, secondary: state.palette.primary })}
        />
      </div>
      <div className="st-roles" role="group" aria-label="Choose a team color to edit">
        {ROLE_FIELDS.map(({ role, label }) => {
          const hex = state.palette[role];
          return (
            <button
              key={role}
              type="button"
              className={cx("st-role", active === role && "is-on")}
              aria-pressed={active === role}
              onClick={() => setActive(role)}
            >
              <span className="st-role__chip" style={{ background: hex, "--chip-ink": inkFor(hex) }} aria-hidden="true">
                {active === role && <Check />}
              </span>
              <span className="st-role__name">{label}</span>
              <span className="t-meta st-role__hex">{hex}</span>
            </button>
          );
        })}
      </div>
      <ColorField
        key={active}
        label={`${activeField.label} color`}
        value={state.palette[active]}
        palette={state.palette}
        roles={[]}
        extra={swatches}
        allowRoles={false}
        onChange={(hex) => actions.setPalette({ [active]: hex })}
        hint={swatches.length ? (sample ? "Swatches are the sample logo's inks." : "Swatches come from your logo.") : undefined}
      />
      {suggested && !atSuggestion && (
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw aria-hidden="true" />}
          onClick={() => actions.setPalette({ primary: suggested.primary, secondary: suggested.secondary, accent: suggested.accent })}
          className="st-colors__reset"
        >
          Reset to logo colors
        </Button>
      )}
    </div>
  );
}

/* ───────────────────────────── samples ───────────────────────────── */

function Samples({ state, actions }) {
  return (
    <div className="st-group st-samples">
      <div className="ml-panel__head"><span className="ml-panel__title">No logo handy? Try a sample</span></div>
      <div className="st-samples__row" role="group" aria-label="Sample logos">
        {SAMPLE_LOGOS.map((s) => {
          const on = state.logo.sampleId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={cx("st-sample", on && "is-on")}
              aria-pressed={on}
              title={s.blurb}
              onClick={() => actions.loadSample(s.id)}
            >
              <span className="st-sample__img"><img src={s.url} alt="" /></span>
              <span className="st-sample__name">{s.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default LogoPanel;
