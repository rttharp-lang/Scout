// OrdersPage (#orders) — the site owner's order inbox as its own view. Everyone else
// sees a short explanation and a way back to their own order.
import React from "react";
import { ArrowLeft } from "lucide-react";
import { useStore } from "../../state/store.jsx";
import { Button, SpecLabel, Spinner } from "../components/index.js";
import { OrderInboxView, useOwnerInbox } from "./OrderInbox.jsx";
import { OrderGuard } from "../pages/Review.jsx";
import "../pages/order.css";

export default function OrdersPage() {
  const { state } = useStore();
  const inbox = useOwnerInbox();
  if (inbox.status === "checking") {
    return (
      <div className="ord-page container">
        <p className="ord-checking"><Spinner /> Checking access…</p>
      </div>
    );
  }
  if (inbox.status === "hidden") {
    const mine = state.order.status === "submitted";
    return (
      <OrderGuard
        kicker="Order inbox"
        title="Only the site owner sees orders here"
        actions={mine
          ? <Button size="lg" href="#done">See your order</Button>
          : <Button size="lg" href="#order" icon={<ArrowLeft aria-hidden="true" />}>Back to your order</Button>}
      >
        <p className="lead">Coaches' order requests land in this inbox when the site runs as a published page with its order database switched on. Looking for an order you placed? Your confirmation and files are on the order page.</p>
      </OrderGuard>
    );
  }
  return (
    <div className="ord-page container">
      <header className="ord-head">
        <SpecLabel size="lg">Owner · Live</SpecLabel>
        <h1 className="ord-title">Order inbox</h1>
        <p className="lead">Every order request, newest first. Open a row for the ship-to address, need-by date and notes; change the status as the order moves.</p>
      </header>
      <OrderInboxView inbox={inbox} title="Requests" />
    </div>
  );
}
