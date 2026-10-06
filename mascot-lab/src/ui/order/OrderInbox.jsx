// OrderInbox — the site owner's live list of submitted orders. Each coach's orders sit in
// their own private document "orders/<viewer id>"; only the artifact's owner can read the
// collection, so this subscribes once to it and flattens every document's orders.
// Shown only when the `user` capability says this viewer is the owner AND `db` is
// available; renders nothing for everyone else (and on the dev server, where
// getCapability() resolves null). Unsubscribes on unmount.
import React, { useEffect, useState } from "react";
import { ChevronDown, Copy, Download, Inbox } from "lucide-react";
import { Button, SpecLabel, cx, useToast } from "../components/index.js";
import { ORDER_STATUSES, fetchOrderLogo, ownerInboxAccess, setOrderStatus, watchOrders } from "../../order/orderService.js";
import { saveFile } from "../../platform/files.js";
import { formatMoney } from "../../order/pricing.js";
import { formatDate, orderText } from "../../order/orderSheet.js";
import { copyText, plural } from "./util.js";
import { teamLabel } from "../../order/team.js";
import { saveError } from "../pages/saveNotice.js";

/** useOwnerInbox() → { status: "checking" | "hidden" | "loading" | "ready" | "error", orders, meta, db, error }. */
export function useOwnerInbox() {
  const [st, setSt] = useState({ status: "checking", orders: [], meta: { statuses: {}, hasStatusDoc: false }, db: null, error: null });
  useEffect(() => {
    let alive = true;
    let unsub = null;
    ownerInboxAccess().then(({ db, owner }) => {
      if (!alive) return;
      if (!owner || !db) { setSt((s) => ({ ...s, status: "hidden" })); return; }
      setSt((s) => ({ ...s, db, status: "loading" }));
      unsub = watchOrders(
        db,
        (orders, meta) => { if (alive) setSt((s) => ({ ...s, orders, meta: meta || s.meta, status: "ready", error: null })); },
        (error) => { if (alive) setSt((s) => ({ ...s, status: "error", error })); },
      );
    });
    return () => { alive = false; if (typeof unsub === "function") unsub(); };
  }, []);
  return st;
}

const statusLabel = (id) => ORDER_STATUSES.find((s) => s.id === id)?.label || id || "Requested";

function InboxRow({ o, db, meta }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const team = teamLabel(o.team, o.contact, "Team");
  const changeStatus = async (status) => {
    if (status === o.status) return;
    setBusy(true);
    try {
      await setOrderStatus(db, o.ref || o.id, status, meta);
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
  const getLogo = async () => {
    setBusy(true);
    try {
      const file = await fetchOrderLogo(db, o);
      if (!file) { toast({ tone: "warning", title: "Logo not found", body: "This order's logo file isn't in the inbox. Ask the coach to email it." }); return; }
      const r = await saveFile(file.filename, file.blob);
      if (!r.ok) toast({ tone: "warning", title: "Logo not saved", body: saveError(r) });
    } catch (e) {
      toast({ tone: "danger", title: "Logo didn't load", body: e?.message || "Try again." });
    } finally {
      setBusy(false);
    }
  };
  const c = o.contact || {};
  return (
    <>
      <tr className={cx("ib-row", open && "is-open", o.replacedBy && "is-replaced")}>
        <td>
          <button type="button" className="ib-ref" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <ChevronDown aria-hidden="true" />
            <span>{o.ref || o.id}</span>
          </button>
        </td>
        <td>
          <strong>{team}</strong>{o.team?.isSample && <SpecLabel variant="warning" className="ib-sample">Sample</SpecLabel>}
          {o.replacedBy && <span className="ib-rev">Replaced by {o.replacedBy}</span>}
          {!o.replacedBy && o.replaces && <span className="ib-rev">Revises {o.replaces}</span>}
        </td>
        <td className="ib-num">{o.totals?.units ?? "–"}</td>
        <td className="ib-num">{o.totals?.total != null ? formatMoney(o.totals.total) : "–"}</td>
        <td><div className="ib-contact"><span>{c.coach || "–"}</span>{c.email && <span className="ib-email">{c.email}</span>}</div></td>
        <td className="ib-date">{o.createdAt ? formatDate(o.createdAt) : "–"}</td>
        <td>
          <select className="ib-status" value={o.status || "requested"} onChange={(e) => changeStatus(e.target.value)} disabled={busy} aria-label={`Status of ${o.ref || o.id}`}>
            {ORDER_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </td>
      </tr>
      {open && (
        <tr className="ib-detail">
          <td colSpan={7}>
            <div className="ib-detail__body">
              {o.logo?.thumb && <img className="ib-thumb" src={o.logo.thumb} alt={`${o.logo.name || "Logo"} thumbnail`} width="72" height="72" />}
              <div className="ib-detail__grid">
                <div><SpecLabel>Design</SpecLabel><p>{[o.effect?.name, o.effect?.method, o.design?.dropStyleName].filter(Boolean).join(" · ") || "–"}</p></div>
                <div><SpecLabel>Kit</SpecLabel><p>{(o.garments || []).map((g) => `${g.name} ${o.quantities?.[g.id]?.total ?? 0}`).join(" · ") || "–"}</p></div>
                <div><SpecLabel>Ship to</SpecLabel><p className="ib-pre">{c.address || "–"}</p></div>
                <div><SpecLabel>Need by</SpecLabel><p>{c.needBy ? formatDate(c.needBy) : "Not given"}</p>{c.phone && <p>{c.phone}</p>}</div>
                {c.notes && <div className="ib-wide"><SpecLabel>Notes</SpecLabel><p className="ib-pre">{c.notes}</p></div>}
              </div>
            </div>
            <div className="cluster">
              <Button size="sm" variant="secondary" icon={<Copy aria-hidden="true" />} onClick={copySummary}>Copy order summary</Button>
              {o.logo?.file && <Button size="sm" variant="secondary" icon={<Download aria-hidden="true" />} onClick={getLogo} disabled={busy}>Download logo</Button>}
              {!o.logo?.file && !o.logo?.isSample && <span className="ib-note">No logo file with this order. Ask the coach to email it.</span>}
            </div>
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
  const open = inbox.orders.filter((o) => !["shipped", "cancelled"].includes(o.status) && !o.replacedBy).length;
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
              <tr><th>Ref</th><th>Team</th><th className="ib-num">Pieces</th><th className="ib-num" title="As worked out in the coach's browser (client-reported). Price the order from the roster and sizes on the proof.">Est. total</th><th>Contact</th><th>Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {inbox.orders.map((o) => <InboxRow key={o.id} o={o} db={inbox.db} meta={inbox.meta} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default OrderInbox;
