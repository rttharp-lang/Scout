// STUB — the effect studio is built in a later phase.
import React from "react";
import PageStub from "./PageStub.jsx";

export default function Studio() {
  return (
    <PageStub
      eyebrow="Step 01 / 03 · Remix"
      title="Remix your logo"
      description="Your logo through every effect at once — halftone, graffiti, chrome and more. Pick one and fine-tune it."
      placeholder="Effect gallery + controls"
      back={{ href: "#home", label: "Start" }}
      next={{ href: "#collection", label: "Next: Collection" }}
    />
  );
}
