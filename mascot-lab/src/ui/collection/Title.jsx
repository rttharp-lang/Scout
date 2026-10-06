// Collection page — garment titles that never break inside a hyphenated word
// ("WARM-UP HOODIE" must not wrap as "WARM-" / "UP HOODIE").
import React from "react";
import { titleWords } from "./format.js";

export function NoBreakTitle({ text }) {
  const words = titleWords(text);
  return words.map((w, i) => (
    <React.Fragment key={i}>
      {i > 0 && " "}
      <span className="cl-nowrap">{w}</span>
    </React.Fragment>
  ));
}
