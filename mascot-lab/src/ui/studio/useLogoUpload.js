// Mascot Lab — the one logo upload flow, shared by the Landing and Studio pages.
//
//   const up = useLogoUpload({ onDone });
//   <input {...up.inputProps} />            hidden file input (type="file" included)
//   <Button onClick={up.openPicker} loading={up.busy}>Upload logo</Button>
//   up.handleFile(file)                      drag-and-drop / paste go through here too
//   up.error                                 plain-English message, or null
//
// handleFile validates the file (PNG/JPG/SVG/WEBP/GIF, ≤ 15 MB), decodes it,
// re-encodes big rasters (1600 px PNG when transparent, else JPEG 0.92) so the
// logo survives localStorage, stores it with setLogo, proposes team colours from
// the cleaned-up logo (suggestPalette → setPalette), marks the team as no longer
// the sample (clearing the sample's names, keeping names the coach typed), then
// calls onDone(). Resolves { ok: true, ... } or { ok: false, error }; never throws.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, DEFAULT_TOLERANCE } from "../../state/store.jsx";
import { SAMPLE_LOGOS } from "../../assets/samples/index.js";
import { hasTransparency, loadImageFromFile, prepareLogo, suggestPalette } from "../../engine/image.js";
import { resizeCanvas } from "../../engine/core.js";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const UPLOAD_ACCEPT = "image/png,image/jpeg,image/svg+xml,image/webp,image/gif,.png,.jpg,.jpeg,.svg,.webp,.gif";
const MAX_SIDE = 1600;
const KEEP_AS_IS_BYTES = 900 * 1024;      // small rasters are stored untouched
const MAX_STORED_CHARS = 2_600_000;       // ≈ 1.9 MB of image: comfortably inside localStorage
const MAX_SVG_CHARS = 1_200_000;

const KINDS = {
  png: ["image/png"],
  jpg: ["image/jpeg", "image/jpg", "image/pjpeg"],
  svg: ["image/svg+xml"],
  webp: ["image/webp"],
  gif: ["image/gif"],
};
const EXT = { png: "png", jpg: "jpg", jpeg: "jpg", svg: "svg", svgz: "svg", webp: "webp", gif: "gif" };

/** kindOf(file) → "png" | "jpg" | "svg" | "webp" | "gif" | null (by MIME type, then extension). */
export function kindOf(file) {
  const type = String(file?.type || "").toLowerCase();
  for (const [k, types] of Object.entries(KINDS)) if (types.includes(type)) return k;
  const ext = String(file?.name || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return (ext && EXT[ext]) || null;
}

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0);

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(file);
  });
}

/** Let the browser paint (spinner, overlay) before the heavy synchronous work. */
const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => setTimeout(r, 0)) : setTimeout(r, 0)));

/** encodeRaster(canvas) → data URL: ≤1600 px, PNG if it has transparency, else JPEG 0.92. */
function encodeRaster(canvas) {
  let c = canvas;
  const long = Math.max(c.width, c.height);
  if (long > MAX_SIDE) c = resizeCanvas(c, (c.width * MAX_SIDE) / long, (c.height * MAX_SIDE) / long);
  if (hasTransparency(c)) {
    let url = c.toDataURL("image/png");
    if (url.length > MAX_STORED_CHARS) {
      // a noisy transparent PNG can still be huge at 1600 px — step down once
      const k = 1200 / Math.max(c.width, c.height);
      if (k < 1) url = resizeCanvas(c, c.width * k, c.height * k).toDataURL("image/png");
    }
    return url;
  }
  return c.toDataURL("image/jpeg", 0.92);
}

/** A friendly display name: "Bulldogs_Primary-Logo_FINAL.png" → "Bulldogs_Primary-Logo_FINAL.png" (kept), blank → "Your logo". */
function displayName(file) {
  const n = String(file?.name || "").trim();
  if (!n || n === "image.png") return "Pasted logo";
  return n.length > 80 ? n.slice(0, 77) + "…" : n;
}

/**
 * useLogoUpload({ onDone } = {}) → { openPicker(), inputProps, handleFile(file), busy, error, clearError() }.
 */
export function useLogoUpload({ onDone } = {}) {
  const { state, actions } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const latest = useRef(state);
  latest.current = state;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const runRef = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const fail = useCallback((run, message) => {
    if (alive.current && runRef.current === run) { setError(message); setBusy(false); }
    return { ok: false, error: message };
  }, []);

  const handleFile = useCallback(async (file) => {
    const run = ++runRef.current;
    if (!file) return { ok: false, error: null };
    setError(null);
    const kind = kindOf(file);
    if (!kind) {
      return fail(run, "That file type isn't supported. Upload a PNG, JPG, SVG or WebP image of your logo.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return fail(run, `That file is ${mb(file.size)} MB. The limit is 15 MB, so export a smaller PNG or JPG and try again.`);
    }
    if (file.size === 0) return fail(run, "That file is empty. Pick the logo file again.");
    setBusy(true);
    await nextFrame();
    try {
      // 1. decode (SVG is rasterized crisply at 2048 on the long side)
      let raw;
      try {
        raw = await loadImageFromFile(file);
      } catch {
        return fail(run, kind === "svg"
          ? "We couldn't read that SVG. Export it again from your design app, or upload a PNG instead."
          : "We couldn't open that image. It may be damaged or saved in a format the browser can't read. Export it again as a PNG and retry.");
      }
      if (!raw?.width || !raw?.height) return fail(run, "That image has no pixels in it. Pick the logo file again.");
      if (runRef.current !== run) return { ok: false, error: null }; // a newer file won

      // 2. what we store: SVG stays SVG text; big rasters are re-encoded; small ones kept as-is
      let src;
      if (kind === "svg") {
        const text = await file.text();
        src = text.length <= MAX_SVG_CHARS
          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
          : encodeRaster(raw);
      } else {
        const long = Math.max(raw.width, raw.height);
        const keep = kind !== "gif" && file.size <= KEEP_AS_IS_BYTES && long <= MAX_SIDE;
        src = keep ? await readAsDataURL(file) : encodeRaster(raw);
        if (!/^data:image\//.test(src)) src = encodeRaster(raw); // odd MIME on the data URL
      }

      // 3. team colours from the cleaned-up logo (background removed, small copy: fast)
      await nextFrame();
      let palette = null;
      let bgRemoved = false;
      try {
        const prepared = await prepareLogo(raw, { removeBg: "auto", tolerance: DEFAULT_TOLERANCE, maxSide: 640 });
        palette = suggestPalette(prepared.canvas);
        bgRemoved = prepared.bgRemoved;
      } catch (e) {
        console.warn("[upload] palette suggestion failed:", e?.message || e);
      }
      if (runRef.current !== run) return { ok: false, error: null };

      // 4. store: logo, colours, team (sample names cleared, typed names kept)
      const prev = latest.current;
      const sampleTeams = SAMPLE_LOGOS.map((s) => `${s.team.school}|${s.team.mascot}`);
      const typedNames = !prev.team.isSample && !prev.logo.sampleId
        ? true
        : !sampleTeams.includes(`${prev.team.school}|${prev.team.mascot}`);
      actions.setLogo({ src, name: displayName(file), bgRemoved: "auto", tolerance: DEFAULT_TOLERANCE, sampleId: undefined });
      if (palette) actions.setPalette(palette);
      actions.setTeam(typedNames ? { isSample: false } : { isSample: false, school: "", mascot: "" });

      if (alive.current && runRef.current === run) setBusy(false);
      const result = { ok: true, name: displayName(file), kind, bgRemoved, palette };
      try { doneRef.current?.(result); } catch (e) { console.error(e); }
      return result;
    } catch (e) {
      console.error("[upload]", e);
      return fail(run, "Something went wrong reading that file. Try again, or export the logo as a PNG.");
    }
  }, [actions, fail]);

  const openPicker = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.value = "";
    el.click();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const inputProps = useMemo(() => ({
    ref: inputRef,
    type: "file",
    accept: UPLOAD_ACCEPT,
    hidden: true,
    tabIndex: -1,
    "aria-hidden": true,
    onChange: (e) => {
      const f = e.target.files?.[0];
      e.target.value = ""; // picking the same file again still fires change
      if (f) handleFile(f);
    },
  }), [handleFile]);

  return { openPicker, inputProps, handleFile, busy, error, clearError };
}

export default useLogoUpload;
