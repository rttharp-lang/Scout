// STUB — the confirmation page is built in a later phase.
import React from "react";
import PageStub from "./PageStub.jsx";

export default function Done() {
  return (
    <PageStub
      eyebrow="Order request"
      title="You're in the queue"
      description="What happens next, your reference number, and your order sheet and artwork files to download."
      placeholder="Confirmation + downloads"
      back={{ href: "#collection", label: "Back to collection" }}
      next={{ href: "#home", label: "Start a new design" }}
    />
  );
}
