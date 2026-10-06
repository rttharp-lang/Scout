// KitNotice — tells the coach when the previews can't be drawn (the logo didn't decode,
// or the chosen effect failed and the clean logo stands in), with the way to fix it.
import React from "react";
import { Button, Notice } from "../components/index.js";
import { kitProblem } from "./kit.js";

export function KitNotice({ kit, className }) {
  const p = kitProblem(kit);
  if (!p) return null;
  return (
    <Notice
      tone={p.tone}
      title={p.title}
      className={className}
      action={<Button size="sm" variant="secondary" href="#studio">{kit?.kind === "logo" ? "Upload the logo again" : "Open the studio"}</Button>}
    >
      {p.body}
    </Notice>
  );
}

export default KitNotice;
