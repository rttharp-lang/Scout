// CopyText — an address, ref or subject shown as selectable text with a copy button.
// In the Artifact frame mailto: links do nothing and the clipboard may be blocked, so
// the text is always there to select by hand, and a failed copy selects it and says so.
// (Also re-exported from ui/order/CopyText.jsx, where it started.)
import React, { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./Button.jsx";
import { cx } from "./cx.js";
import "./components.css";

/** copyToClipboard(text) → Promise<boolean> — clipboard API, then the execCommand fallback. */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(text));
      return true;
    }
  } catch { /* blocked (sandboxed frame, no permission) — try the old way */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = String(text);
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * CopyText — text + "Copy" button. size: "md" | "lg" (big mono, for order refs);
 * mono: spec-sheet type for codes and addresses; label: the button text.
 */
export function CopyText({ text, label = "Copy", className, size = "md", mono = true }) {
  const [state, setState] = useState("idle"); // idle | copied | failed
  const ref = useRef(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onCopy = async () => {
    const ok = await copyToClipboard(text);
    if (!ok && ref.current) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2600);
  };
  // ord-copy* class names stay for the page styles written against the original component
  return (
    <span className={cx("ml-copy", "ord-copy", size === "lg" && "ml-copy--lg ord-copy--lg", className)}>
      <span ref={ref} className={cx("ml-copy__text", "ord-copy__text", mono && "ml-copy__text--mono ord-copy__text--mono")}>{text}</span>
      <Button
        variant="secondary"
        size="sm"
        onClick={onCopy}
        icon={state === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        aria-label={`${label}: ${text}`}
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Selected" : label}
      </Button>
      <span className="visually-hidden" aria-live="polite">
        {state === "copied" ? "Copied to the clipboard." : state === "failed" ? "Couldn't copy here. The text is selected, so press Ctrl+C or Cmd+C." : ""}
      </span>
    </span>
  );
}

export default CopyText;
