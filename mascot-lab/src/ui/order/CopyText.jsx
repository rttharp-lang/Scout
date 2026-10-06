// CopyText — an address (or ref) shown as selectable text with a copy button. In the
// Artifact frame mailto: links and the clipboard may both be blocked, so the text is
// always there to select by hand, and a failed copy says so.
import React, { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, cx } from "../components/index.js";
import { copyText } from "./util.js";

export function CopyText({ text, label = "Copy", className, size = "md", mono = true }) {
  const [state, setState] = useState("idle"); // idle | copied | failed
  const ref = useRef(null);
  const timer = useRef(0);
  const onCopy = async () => {
    const ok = await copyText(text);
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
  return (
    <span className={cx("ord-copy", size === "lg" && "ord-copy--lg", className)}>
      <span ref={ref} className={cx("ord-copy__text", mono && "ord-copy__text--mono")}>{text}</span>
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
