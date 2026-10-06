// OrderInbox — the site owner's live list of submitted orders (artifact db collection
// "orders"). Shown only when the `user` capability says this viewer is the owner AND
// `db` is available; renders nothing for everyone else (and on the dev server, where
// getCapability() resolves null). Subscribes once, unsubscribes on unmount.
import React, { useEffect, useState } from "react";
import { ChevronDown, Copy, Inbox } from "lucide-react";
import { Button, SpecLabel, cx, useToast } from "../components/index.js";
import { ORDER_STATUSES, ownerInboxAccess, setOrderStatus, watchOrders } from "../../order/orderService.js";
import { formatMoney } from "../../order/pricing.js";
import { formatDate, orderText } from "../../order/orderSheet.js";
import { copyText, plural } from "./util.js";

/** useOwnerInbox() → { status: "checking" | "hidden" | "loading" | "ready" | "error", orders, db, error }. */
export function useOwnerInbox() {
  const [st, setSt] = useState({ status: "checking", orders: [], db: null, error: null });
  useEffect(() => {
    let alive = true;
    let unsub = null;
    ownerInboxAccess().then(({ db, owner }) => {
      if (!alive) return;
      if (!owner || !db) { setSt((s) => ({ ...s, status: "hidden" })); return; }
      setSt((s) => ({ ...s, db, status: "loading" }));
      unsub = watchOrders(
        db,
        (orders) => { if (alive) setSt((s) => ({ ...s, orders, status: "ready", error: null })); },
        (error) => { if (alive) setSt((s) => ({ ...s, status: "error", error })); },
      );
    });
    return () => { alive = false; if (typeof unsub === "function") unsub(); };
  }, []);
  return st;
}

const statusLabel = (id) => ORDER_STATUSES.find((s) => s.id === id)?.label || id || "Requested";

function InboxRow({ o, db }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const team = [o.team?.school, o.team?.mascot].filter(Boolean).join(" ") || "Team";
  const changeStatus = async (status) => {
    if (status === o.status) return;
    setBusy(true);
    try {
      await setOrderStatus(db, o.ref || o.id, status);
      toast({ tone: "success", title: `${o.ref || o.id} marked ${statusLabel(status).toLowerCase()}` });
    } catch (e) {
      toast({ tone: "danger", title: "Status not saved", body: e?.code === "invalid_argument" ? "This account can't change orders." : e?.message || "Try again." });
    } finally {
      setBusy(false);
    }
  };
  const copySummary = async () => {
    const ok = await copyText(orderText(o));
    toast(ok ? { tone: "success", title: "Order summary copied" } : { tone: "warning", title: "Couldn't copy here", body: "Open the row and select the text instead." });
  };
  const c = o.contact || {};
  return (
    <>
      <tr className={cx("ib-row", open && "is-open")}>
        <td>
          <button type="button" className="ib-ref" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <ChevronDown aria-hidden="true" />
            <span>{o.ref || o.id}</span>
          </button>
        </td>
        <td><strong>{team}</strong>{o.team?.isSample && <SpecLabel variant="warning" className="ib-sample">Sample</SpecLabel>}</td>
        <td className="ib-num">{o.totals?.units ?? "–"}</td>
        <td className="ib-num">{o.totals ? formatMoney(o.totals.total) : "–"}</td>
        <td className="ib-contact"><span>{c.coach || "–"}</span><span className="ib-email">{c.email}</span></td>
        <td className="ib-date">{formatDate(o.createdAt)}</td>
        <td>
          <select className="ib-status" value={o.status || "requested"} onChange={(e) => changeStatus(e.target.value)} disabled={busy} aria-label={`Status of ${o.ref || o.id}`}>
            {ORDER_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </td>
      </tr>
      {open && (
        <tr className="ib-detail">
          <td colSpan={7}>
            <div className="ib-detail__grid">
              <div><SpecLabel>Design</SpecLabel><p>{o.effect?.name} · {o.effect?.method} · {o.design?.dropStyleName}</p></div>
              <div><SpecLabel>Kit</SpecLabel><p>{(o.garments || []).map((g) => `${g.name} ${o.quantities?.[g.id]?.total ?? 0}`).join(" · ")}</p></div>
              <div><SpecLabel>Ship to</SpecLabel><p className="ib-pre">{c.address || "–"}</p></div>
              <div><SpecLabel>Need by</SpecLabel><p>{c.needBy ? formatDate(c.needBy) : "Not given"}</p>{c.phone && <p>{c.phone}</p>}</div>
              {c.notes && <div className="ib-wide"><SpecLabel>Notes</SpecLabel><p className="ib-pre">{c.notes}</p></div>}
            </div>
            <Button size="sm" variant="secondary" icon={<Copy aria-hidden="true" />} onClick={copySummary}>Copy order summary</Button>
          </td>
        </tr>
      )}
    </>
  );
}

/** OrderInbox — subscribes (once) and renders nothing unless the viewer is the owner with db access. */
export function OrderInbox(props) {
  const inbox = useOwnerInbox();
  return <OrderInboxView inbox={inbox} {...props} />;
}

/** OrderInboxView — the list for an inbox state from useOwnerInbox() (no subscription of its own). */
export function OrderInboxView({ inbox, title = "Order inbox", showEmpty = true }) {
  if (inbox.status === "checking" || inbox.status === "hidden") return null;
  const n = inbox.orders.length;
  const open = inbox.orders.filter((o) => !["shipped", "cancelled"].includes(o.status)).length;
  return (
    <section className="ord-panel ib" aria-labelledby="ib-h">
      <header className="ord-panel__head">
        <h2 className="ord-panel__h" id="ib-h">{title}</h2>
        <SpecLabel variant="team">Owner only</SpecLabel>
        <SpecLabel>{inbox.status === "ready" ? `${plural(n, "order")} · ${open} open · live` : inbox.status === "loading" ? "Loading…" : "Not connected"}</SpecLabel>
      </header>
      {inbox.status === "error" && <p className="ib-error">The inbox stopped updating ({inbox.error?.code || "error"}). Reload the page to reconnect.</p>}
      {inbox.status === "ready" && n === 0 && showEmpty && (
        <div className="ib-empty"><Inbox aria-hidden="true" /><p>No orders yet. Requests appear here the moment a coach sends one.</p></div>
      )}
      {n > 0 && (
        <div className="ib-wrap">
          <table className="ib-table">
            <thead>
              <tr><th>Ref</th><th>Team</th><th className="ib-num">Pieces</th><th className="ib-num">Total</th><th>Contact</th><th>Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {inbox.orders.map((o) => <InboxRow key={o.id} o={o} db={inbox.db} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default OrderInbox;
