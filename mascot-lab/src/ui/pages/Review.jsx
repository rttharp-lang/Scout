// Review — the order as a print-shop order sheet, plus the coach's details, then an
// honest submit (artifact db → endpoint → this device) and on to #done.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, CheckCircle2, Send, Save } from "lucide-react";
import { useStore } from "../../state/store.jsx";
import { useLogoCanvas } from "../../state/useLogoCanvas.js";
import { Button, Notice, RegMark, SpecLabel, navigate } from "../components/index.js";
import { CONTACT_EMAIL } from "../../brand.js";
import { PROOF_TIME } from "../../order/catalog.js";
import { countedRows, formatMoney, totals } from "../../order/pricing.js";
import { buildOrder, likelyChannel, submitOrder } from "../../order/orderService.js";
import { OrderSheetView } from "../order/OrderSheetView.jsx";
import { ContactForm } from "../order/ContactForm.jsx";
import { letteringFor, useEffectMeta, useMockups, useOrderGarments } from "../order/kit.js";
import { logoThumb } from "../order/exports.js";
import { setLastResult } from "../order/session.js";
import { plural, shortDate } from "../order/util.js";
import { orderChecks } from "./Order.jsx";
import "./order.css";

/** OrderGuard — shown instead of a page that has nothing to show yet. */
export function OrderGuard({ kicker, title, children, actions }) {
  return (
    <div className="ord-page container">
      <section className="ord-guard crop-marks">
        <RegMark size={30} />
        <SpecLabel>{kicker}</SpecLabel>
        <h1 className="ord-guard__title">{title}</h1>
        <div className="ord-guard__body">{children}</div>
        <div className="cluster ord-guard__actions">{actions}</div>
      </section>
    </div>
  );
}

export default function Review() {
  const { state, actions } = useStore();
  const { ids, byId, garments } = useOrderGarments();
  const effect = useEffectMeta();
  const logo = useLogoCanvas();
  const formRef = useRef(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [channel, setChannel] = useState(null);
  useEffect(() => { let on = true; likelyChannel().then((c) => on && setChannel(c)); return () => { on = false; }; }, []);

  const t = useMemo(() => totals(state, { garmentIds: ids }), [state.roster, state.extras, state.collection, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const { blockers, warnings } = orderChecks(state, ids, t);
  const order = useMemo(
    () => buildOrder(state, { garments, garmentIds: ids, effect, createdAt: state.order.submittedAt || undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, garments, ids.join(), effect],
  );
  const lead = countedRows(state.roster).find((r) => String(r.number || "").trim());
  const lettering = useMemo(() => letteringFor(lead), [lead?.name, lead?.number]); // eslint-disable-line react-hooks/exhaustive-deps
  const { mockups, kit } = useMockups(ids, { size: 400, detail: "full", views: ["front", "back"], lettering, priority: 4 });
  const submitted = state.order.status === "submitted";
  const sent = state.order.channel === "artifact-db" || state.order.channel === "endpoint";

  // prefill the school from the team name the first time
  useEffect(() => {
    if (!state.contact.school && state.team.school && !state.team.isSample) actions.setContact({ school: state.team.school });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!submitted && blockers.length) {
    const empty = t.units === 0;
    return (
      <OrderGuard
        kicker="Review"
        title={empty ? "Nothing to review yet" : "Not ready to review"}
        actions={<Button size="lg" href="#order" icon={<ArrowLeft aria-hidden="true" />}>Back to the order</Button>}
      >
        <p className="lead">{empty ? "Add your players and sizes first. The order sheet builds itself from the roster." : "The order needs a couple of fixes before it can go to the print shop:"}</p>
        {!empty && <ul className="ord-guard__list">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      </OrderGuard>
    );
  }

  const send = async () => {
    setTried(true);
    setFailure(null);
    if (!formRef.current?.check()) return;
    setBusy(true);
    try {
      const body = buildOrder(state, { garments, garmentIds: ids, effect, logoThumb: logoThumb(logo.canvas), rightsConfirmed: true });
      const res = await submitOrder(body);
      setLastResult(res);
      if (res.ok) {
        actions.markSubmitted({ ref: res.ref, channel: res.channel, submittedAt: body.createdAt });
        navigate("done");
      } else {
        setFailure(res);
      }
    } catch (e) {
      setFailure({ message: `Something went wrong while saving the order (${e?.message || e}). Nothing was sent. Try again, or email ${CONTACT_EMAIL}.` });
    } finally {
      setBusy(false);
    }
  };
  const continueUnsaved = () => {
    actions.markSubmitted({ ref: failure.ref, channel: "local", submittedAt: new Date().toISOString() });
    navigate("done");
  };

  const local = channel === "local";
  const sendLabel = channel === null ? "Send order request" : local ? "Save order and get the pack" : "Send order request";

  return (
    <div className="ord-page rv-page container">
      <header className="ord-head">
        <SpecLabel size="lg">Step 03 / 03 · Review</SpecLabel>
        <h1 className="ord-title">Review &amp; send</h1>
        <p className="lead">This is the sheet the print shop works from. Check it, add your details, and send the request. Nothing is printed until you approve a proof.</p>
        {!submitted && (
          <Button
            variant="secondary"
            size="sm"
            className="rv-jump"
            iconRight={<ArrowDown aria-hidden="true" />}
            onClick={() => {
              document.getElementById("rv-send-h")?.scrollIntoView({ behavior: "smooth", block: "start" });
              setTimeout(() => document.querySelector('.rv-form input[name="coach"]')?.focus({ preventScroll: true }), 400);
            }}
          >
            Go to your details
          </Button>
        )}
      </header>

      {submitted && (
        <Notice
          tone="success"
          title={`Order ${state.order.ref || ""} was ${sent ? "sent" : "saved on this device"} on ${shortDate(state.order.submittedAt, true)}`}
          action={
            <div className="cluster">
              <Button size="sm" href="#done" icon={<CheckCircle2 aria-hidden="true" />}>See confirmation</Button>
              <Button size="sm" variant="secondary" onClick={() => { actions.reopenOrder(); navigate("order"); }}>Edit order</Button>
            </div>
          }
        >
          This is what you sent. To change it, reopen the order and send it again.
        </Notice>
      )}

      <div className="ord-layout rv-layout">
        <div className="ord-main">
          {warnings.length > 0 && !submitted && (
            <Notice tone="warning" title="Worth a second look">
              <ul className="rv-warnlist">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </Notice>
          )}
          <OrderSheetView
            order={order}
            mockups={mockups}
            art={kit.art}
            stage={kit.effect?.stage || effect?.stage || "paper"}
            logoCanvas={logo.canvas}
            refLabel={submitted ? state.order.ref : "Assigned when you send"}
            status={submitted ? (sent ? "Requested" : "Saved") : "Draft"}
          />
        </div>

        <aside className="rv-aside" aria-label="Your details and send">
          <section className="ord-panel rv-send" aria-labelledby="rv-send-h">
            <span className="rv-send__stripe" aria-hidden="true" />
            <h2 className="ord-panel__h" id="rv-send-h">Your details</h2>
            <p className="rv-send__intro">We send the proof and any questions here.</p>
            <ContactForm
              ref={formRef}
              contact={state.contact}
              onChange={actions.setContact}
              teamName={state.team.school}
              disabled={submitted || busy}
              showAll={tried}
            />
            <div className="rv-send__total">
              <span>Estimated total</span>
              <strong>{formatMoney(t.total)}</strong>
              <SpecLabel>{plural(t.units, "piece")} · {plural(t.players, "player")}</SpecLabel>
            </div>
            {failure && (
              <Notice tone="danger" title="The order wasn't saved">
                <p>{failure.message}</p>
                {failure.ref && (
                  <div className="cluster" style={{ marginTop: 8 }}>
                    <Button size="sm" variant="secondary" onClick={continueUnsaved}>Get the order pack anyway</Button>
                  </div>
                )}
              </Notice>
            )}
            {local && !submitted && (
              <p className="rv-send__channel">
                This preview isn't connected to an order inbox yet. Your order is saved on this device, then you email the order pack to <strong>{CONTACT_EMAIL}</strong>.
              </p>
            )}
            {!submitted && (
              <Button variant="team" size="lg" block loading={busy} onClick={send} icon={local ? <Save aria-hidden="true" /> : <Send aria-hidden="true" />}>
                {busy ? (local ? "Saving…" : "Sending…") : sendLabel}
              </Button>
            )}
            {submitted && <Button variant="team" size="lg" block href="#done" icon={<CheckCircle2 aria-hidden="true" />}>See confirmation</Button>}
            <p className="rv-send__fine">
              Proof within {PROOF_TIME}. No payment is taken on this site. Prices are estimates until you approve the proof.
            </p>
          </section>
          <Button variant="secondary" href="#order" icon={<ArrowLeft aria-hidden="true" />}>Back: Order</Button>
        </aside>
      </div>
    </div>
  );
}
