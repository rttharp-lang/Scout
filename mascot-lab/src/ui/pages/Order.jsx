// STUB — the order builder is built in a later phase.
import React from "react";
import PageStub from "./PageStub.jsx";

export default function Order() {
  return (
    <PageStub
      eyebrow="Step 03 / 03 · Order"
      title="Order the kit"
      description="Roster names, numbers and sizes, extras for coaches and fans, and a running price with volume breaks."
      placeholder="Roster + sizes + pricing"
      back={{ href: "#collection", label: "Back: Collection" }}
      next={{ href: "#review", label: "Review order" }}
    />
  );
}
