// Mascot Lab — hand a generated file to the user.
//
// Inside the claude.ai Artifact frame `<a download>` does nothing, so the
// `downloads` capability is tried first (the viewer confirms the save). Outside
// that runtime (dev server, static deploy) a temporary anchor click downloads it.
// Inside the frame WITHOUT the capability (signed out, not granted) there is no way
// to save a file: saveFile says so ({ ok: false, how: "anchor-inert" }) instead of
// clicking an anchor that silently does nothing and reporting "download started".
import { getCapability, inArtifactRuntime } from "./claude.js";

const MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", zip: "application/zip",
  csv: "text/csv;charset=utf-8", json: "application/json", html: "text/html;charset=utf-8",
  txt: "text/plain;charset=utf-8", pdf: "application/pdf", md: "text/markdown;charset=utf-8",
};
// codes that mean "this runtime can't save" → try the plain browser download instead
const FALL_THROUGH = new Set(["unavailable", "not_granted", "capability_disabled", "capability_removed"]);

export function mimeFor(filename) {
  const ext = String(filename).split(".").pop().toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

function toBlob(data, filename) {
  if (data instanceof Blob) return data;
  if (typeof data === "string") return new Blob([data], { type: mimeFor(filename) });
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data], { type: mimeFor(filename) });
  return new Blob([String(data ?? "")], { type: mimeFor(filename) });
}

function anchorDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // give the browser a beat to start the download before revoking
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

/** The message callers show when this view can't save files at all. */
export const DOWNLOADS_UNAVAILABLE = "Downloads aren't available in this view.";

/**
 * saveFile(filename, blobOrString) →
 *   Promise<{ ok, how: "downloads" | "anchor" | "anchor-inert", error?, code? }>.
 * Never throws. `code` carries the downloads capability's error code (e.g. "declined"),
 * or "downloads_unavailable" with how: "anchor-inert" (ok: false) inside the Artifact
 * frame when the capability is missing — `<a download>` does nothing there.
 */
export async function saveFile(filename, data) {
  const name = String(filename || "download.txt");
  const downloads = await getCapability("downloads");
  if (downloads && typeof downloads.save === "function") {
    try {
      await downloads.save({ filename: name, data: typeof data === "string" || data instanceof Blob ? data : toBlob(data, name) });
      return { ok: true, how: "downloads" };
    } catch (e) {
      const code = (e && e.code) || "unavailable";
      if (!FALL_THROUGH.has(code)) {
        const message =
          code === "declined" ? "Download canceled."
          : code === "rate_limited" ? "A download prompt is already open."
          : code === "rejected_extension" || code === "extension_not_enabled" ? "That file type can't be saved here."
          : (e && e.message) || "The file couldn't be saved.";
        return { ok: false, how: "downloads", error: message, code };
      }
    }
  }
  if (inArtifactRuntime()) {
    return { ok: false, how: "anchor-inert", code: "downloads_unavailable", error: DOWNLOADS_UNAVAILABLE };
  }
  try {
    anchorDownload(name, toBlob(data, name));
    return { ok: true, how: "anchor" };
  } catch (e) {
    return { ok: false, how: "anchor", error: (e && e.message) || "The file couldn't be saved." };
  }
}
