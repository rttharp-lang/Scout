// Mascot Lab — page-wide logo intake for the Studio: drag a file anywhere on the
// page (→ full-page drop overlay) or paste an image from the clipboard.
import { useEffect, useRef, useState } from "react";

const hasFiles = (e) => {
  const t = e.dataTransfer?.types;
  if (!t) return false;
  return Array.from(t).includes("Files");
};

const isEditable = (el) =>
  !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""));

/** imageFromClipboard(event) → File | null (the first image file on the clipboard). */
export function imageFromClipboard(e) {
  const cd = e.clipboardData;
  if (!cd) return null;
  for (const item of Array.from(cd.items || [])) {
    if (item.kind === "file" && /^image\//i.test(item.type)) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  const f = cd.files?.[0];
  return f && /^image\//i.test(f.type) ? f : null;
}

/**
 * useGlobalDrop({ onFile, enabled = true }) → { dragging }.
 * `dragging` is true while files are dragged over the window (show the overlay).
 */
export function useGlobalDrop({ onFile, enabled = true }) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const fileRef = useRef(onFile);
  fileRef.current = onFile;

  useEffect(() => {
    if (!enabled) return undefined;
    const reset = () => { depth.current = 0; setDragging(false); };
    const onEnter = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setDragging(true);
    };
    const onOver = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e) => {
      if (!hasFiles(e) && depth.current === 0) return;
      depth.current = Math.max(0, depth.current - 1);
      // leaving the window entirely reports a null relatedTarget
      if (depth.current === 0 || !e.relatedTarget) reset();
    };
    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      reset();
      const f = e.dataTransfer.files?.[0];
      if (f) fileRef.current?.(f, "drop");
    };
    const onPaste = (e) => {
      const f = imageFromClipboard(e);
      if (!f) return; // plain text pastes into fields stay untouched
      if (isEditable(e.target) && e.clipboardData?.types?.includes?.("text/plain")) return;
      e.preventDefault();
      fileRef.current?.(f, "paste");
    };
    const onKey = (e) => { if (e.key === "Escape") reset(); };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", reset);
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", reset);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", reset);
    };
  }, [enabled]);

  return { dragging };
}
