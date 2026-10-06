// STUB — order review is built in a later phase.
import React from "react";
import PageStub from "./PageStub.jsx";

export default function Review() {
  return (
    <PageStub
      eyebrow="Step 03 / 03 · Review"
      title="Review & send"
      description="One last look at the kit, the roster and the totals, then send the order request for a proof."
      placeholder="Order summary + contact"
      back={{ href: "#order", label: "Back: Order" }}
      next={{ href: "#done", label: "Send order request" }}
    />
  );
}
