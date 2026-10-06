// Done — what actually happened to the order (sent vs saved on this device), the
// order ref, next steps with dates, the files (order sheet, roster CSV, design pack),
// and the owner's inbox when the viewer owns the site.
import React, { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Download, FileSpreadsheet, FileText, Mail, Package, Pencil, RotateCcw } from "lucide-react";
import { useStore, EMPTY_CONTACT } from "../../state/store.jsx";
import { useLogoCanvas } from "../../state/useLogoCanvas.js";
import { Button, CanvasImage, Notice, SpecLabel, cx, navigate, useConfirm, useToast } from "../components/index.js";
import { CONTACT_EMAIL } from "../../brand.js";
import { LEAD_TIME, LEAD_TIME_MAX_DAYS, LEAD_TIME_MIN_DAYS, PROOF_BUSINESS_DAYS, PROOF_TIME } from "../../order/catalog.js";
import { formatMoney, totals } from "../../order/pricing.js";
import { clearRevision, findLocalOrder, rememberRevision } from "../../order/orderService.js";
import { formatDate } from "../../order/orderSheet.js";
import { saveFile } from "../../platform/files.js";
import { inArtifactRuntime } from "../../platform/claude.js";
import { CopyText } from "../order/CopyText.jsx";
import { OrderInboxView, useOwnerInbox } from "../order/OrderInbox.jsx";
import { fileBase, makeDesignPack, makeOrderSheet, makeOrderText, makeRosterCsv } from "../order/exports.js";
import { placeholderText, useEffectMeta, useMockups, useOrderGarments } from "../order/kit.js";
import { KitNotice } from "../order/KitNotice.jsx";
import { getLastResult } from "../order/session.js";
import { addBusinessDays, addDays, copyText, plural, shortDate } from "../order/util.js";
import { OrderGuard } from "./Review.jsx";
import "./order.css";

function FileRow({ icon, title, ext, desc, state, onClick, label = "Download" }) {
  const working = state?.status === "working";
  const pct = state?.total ? Math.round((state.done / state.total) * 100) : 0;
  return (
    <li className={cx("dn-file", working && "is-working", state?.status === "done" && "is-done", state?.status === "error" && "is-error")}>
      <span className="dn-file__icon" aria-hidden="true">{icon}</span>
      <div className="dn-file__main">
        <div className="dn-file__title"><strong>{title}</strong><SpecLabel variant="box">{ext}</SpecLabel></div>
        <p className="dn-file__desc">{desc}</p>
        {working && state.total > 0 && (
          <div className="dn-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${title} progress`}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
        {working && state.label && <p className="dn-file__status">{state.label}…</p>}
        {state?.status === "done" && <p className="dn-file__status is-ok"><Check aria-hidden="true" /> {state.how === "downloads" ? "Saved." : "Download started. Check your downloads folder."}</p>}
        {state?.status === "error" && <p className="dn-file__status is-bad" role="alert"><AlertTriangle aria-hidden="true" /> {state.error}</p>}
      </div>
      <Button variant={state?.status === "done" ? "secondary" : "primary"} size="sm" onClick={onClick} loading={working} icon={<Download aria-hidden="true" />}>
        {working ? `${pct || ""}${pct ? "%" : "Working"}` : state?.status === "done" ? "Download again" : label}
      </Button>
    </li>
  );
}

export default function Done() {
  const { state, actions } = useStore();
  const confirm = useConfirm();
  const { toast } = useToast();
  const { ids, byId, garments } = useOrderGarments();
  const effect = useEffectMeta();
  const logo = useLogoCanvas();
  const inbox = useOwnerInbox();
  const [files, setFiles] = useState({});
  const submitted = state.order.status === "submitted";
  const { mockups, kit } = useMockups(submitted ? ids : [], { size: 176, detail: "fast", views: ["front"], priority: 2 });
  const t = useMemo(() => totals(state, { garmentIds: ids }), [state.roster, state.extras, state.collection, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!submitted) {
    return (
      <>
        <OrderGuard
          kicker="Order"
          title="No order sent yet"
          actions={
            <>
              <Button size="lg" href="#order">Go to the order</Button>
              <Button size="lg" variant="secondary" href="#collection">See the collection</Button>
            </>
          }
        >
          <p className="lead">Your logo, look and kit are saved in this browser. When the roster and sizes are in, review the order and send it from there.</p>
        </OrderGuard>
        {inbox.status !== "hidden" && inbox.status !== "checking" && <div className="container dn-inbox"><OrderInboxView inbox={inbox} /></div>}
      </>
    );
  }

  const ref = state.order.ref || "—";
  const channel = state.order.channel;
  const sent = channel === "artifact-db" || channel === "endpoint";
  const last = getLastResult(state.order.ref);
  const localCopy = findLocalOrder(state.order.ref);
  const reason = last?.fallbackReason ?? localCopy?.reason ?? null;
  const notStored = !sent && !localCopy;
  const why = reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}` : inArtifactRuntime() ? "This page can't send orders from your account" : "This preview isn't connected to an order inbox yet";
  const submittedAt = state.order.submittedAt ? new Date(state.order.submittedAt) : new Date();
  const proofBy = addBusinessDays(submittedAt, PROOF_BUSINESS_DAYS);
  const shipFrom = addDays(proofBy, LEAD_TIME_MIN_DAYS);
  const shipTo = addDays(proofBy, LEAD_TIME_MAX_DAYS);
  const email = state.contact.email;
  // an uploaded logo clears the sample's team name; the school from the contact form stands in
  const team = [state.team.school, state.team.mascot].filter(Boolean).join(" ") || String(state.contact.school || "").trim();
  const ctx = { garments, ids, byId, effect, logo, logoCanvas: logo.canvas };
  const base = fileBase(state);
  const subject = team ? `Order ${ref} · ${team}` : `Order ${ref}`;

  const setFile = (k, v) => setFiles((f) => ({ ...f, [k]: { ...(f[k] || {}), ...v } }));
  const finish = (k, r) => setFile(k, r.ok ? { status: "done", how: r.how } : { status: "error", error: r.error || "The file couldn't be saved." });
  const run = async (k, make) => {
    if (files[k]?.status === "working") return;
    setFile(k, { status: "working", done: 0, total: 0, label: "" });
    try {
      finish(k, await make());
    } catch (e) {
      setFile(k, { status: "error", error: `Couldn't build the file: ${e?.message || e}` });
    }
  };
  const dlSheet = () => run("sheet", async () => {
    setFile("sheet", { label: "Rendering the garments" });
    const { html } = await makeOrderSheet(state, ctx);
    return saveFile(`${base}-order-sheet.html`, html);
  });
  const dlCsv = () => run("csv", async () => saveFile(`${base}-roster.csv`, makeRosterCsv(state, ctx)));
  const dlPack = () => run("pack", async () => {
    const { blob, filename } = await makeDesignPack(state, ctx, (done, total, label) => setFile("pack", { done, total, label }));
    return saveFile(filename, blob);
  });
  const copySummary = async () => {
    const ok = await copyText(makeOrderText(state, ctx));
    toast(ok ? { tone: "success", title: "Order summary copied", body: "Paste it into the body of your email." } : { tone: "warning", title: "Couldn't copy here", body: "Download the order sheet and attach it instead." });
  };

  const editOrder = () => {
    rememberRevision(state.order.ref);
    actions.reopenOrder();
    toast({ title: "Order reopened", body: "Make your changes, then review and send it again." });
    navigate("order");
  };
  const startNew = async () => {
    const ok = await confirm({
      kicker: "New order",
      title: "Start a new order?",
      body: `This keeps your logo, look and kit, and clears the roster, extras and your contact details. ${
        sent ? `Order ${ref} stays with us; download its files first if you want copies.`
        : notStored ? `Order ${ref} isn't saved anywhere yet, so download its files first.`
        : `Order ${ref} stays saved on this device.`}`,
      confirmLabel: "Start new order",
      tone: "danger",
    });
    if (!ok) return;
    clearRevision();
    actions.setRoster([]);
    actions.setExtras({});
    actions.setContact({ ...EMPTY_CONTACT, rightsConfirmed: false });
    actions.reopenOrder();
    navigate("order");
  };

  // an uploaded logo goes with a db order when it fits; otherwise the coach emails it
  const uploaded = !state.logo.sampleId;
  // (this page load's submit result first: with storage blocked there is no local copy)
  const logoWithOrder = channel === "artifact-db" ? !!(last?.logoStored || localCopy?.order?.logo?.file) : channel === "endpoint";
  const steps = sent
    ? [
        { k: "Received", when: shortDate(submittedAt), body: <>Order <span className="dn-nowrap">{ref}</span> is in our inbox{uploaded && logoWithOrder ? ", with your logo" : ""}.</>, state: "done" },
        ...(uploaded && !logoWithOrder ? [{ k: "Send your logo", when: "Today", body: <>Your logo file didn't go with the request. Email it to {CONTACT_EMAIL} with <span className="dn-nowrap">{ref}</span> in the subject so we can build the proof.</>, state: "current" }] : []),
        { k: "Proof", when: `By ${shortDate(proofBy)}`, body: `We email a proof to ${email || "you"}: every garment, the sizes and the final price.`, state: uploaded && !logoWithOrder ? undefined : "current" },
        { k: "You approve", when: "Your call", body: "Reply to approve, or ask for changes. Nothing is printed before you approve." },
        { k: "Production", when: LEAD_TIME, body: "Printing, sewing, and a quality check on every piece." },
        { k: "Ships", when: `${shortDate(shipFrom)} to ${shortDate(shipTo)}`, body: `If you approve the proof the day it arrives. Ships to ${state.contact.school || "your school"}.` },
      ]
    : [
        { k: "Email the pack", when: "Today", body: <>Attach the design pack (or the order sheet) and send it to {CONTACT_EMAIL} with <span className="dn-nowrap">{ref}</span> in the subject.</>, state: "current" },
        { k: "Proof", when: PROOF_TIME, body: "After we receive it, we email a proof: every garment, the sizes and the final price." },
        { k: "You approve", when: "Your call", body: "Reply to approve, or ask for changes. Nothing is printed before you approve." },
        { k: "Production", when: LEAD_TIME, body: "Printing, sewing, and a quality check on every piece." },
        { k: "Ships", when: "About 4 weeks", body: "From the day you approve the proof." },
      ];

  return (
    <div className="ord-page dn-page container">
      <section className={cx("dn-hero", sent ? "is-sent" : "is-local")} aria-labelledby="dn-title">
        <div className="dn-hero__main">
          <SpecLabel variant={sent ? "success" : "warning"} size="lg">{sent ? "Request sent" : notStored ? "Not sent yet" : "Saved on this device"}</SpecLabel>
          <h1 className="dn-title" id="dn-title">{sent ? "You're in the queue" : "One step left"}</h1>
          {sent ? (
            <p className="lead">Order request sent. We'll email a proof to <strong>{email}</strong> within {PROOF_TIME}.</p>
          ) : (
            <p className="lead">
              {why}{notStored ? ", and this browser won't let us save the order." : ", so your order was saved on this device."}{" "}
              Download the design pack below and email it to <strong className="dn-addr">{CONTACT_EMAIL}</strong>.
            </p>
          )}
          {notStored && (
            <Notice tone="warning" title="This browser didn't keep a copy">
              Download the design pack before you leave this page. It holds everything we need to print the order.
            </Notice>
          )}
        </div>
        <div className="dn-ticket" role="group" aria-label="Order reference">
          <span className="dn-ticket__k">Order ref</span>
          <CopyText text={ref} label="Copy ref" size="lg" />
          <dl className="dn-ticket__meta">
            <div><dt>Team</dt><dd>{team}</dd></div>
            <div><dt>Pieces</dt><dd>{t.units}</dd></div>
            <div><dt>Estimate</dt><dd>{formatMoney(t.total)}</dd></div>
            <div><dt>{sent ? "Sent" : notStored ? "Date" : "Saved"}</dt><dd>{formatDate(state.order.submittedAt)}</dd></div>
          </dl>
        </div>
      </section>

      {!sent && (
        <section className="ord-panel dn-mail" aria-labelledby="dn-mail-h">
          <h2 className="ord-panel__h" id="dn-mail-h"><Mail aria-hidden="true" /> Email it to us</h2>
          <ol className="dn-mail__steps">
            <li><span>Send to</span><CopyText text={CONTACT_EMAIL} label="Copy address" /></li>
            <li><span>Subject</span><CopyText text={subject} label="Copy subject" mono={false} /></li>
            <li><span>Attach</span><p>The design pack (.zip) below. It has the order sheet, roster and print-ready artwork.</p></li>
            <li><span>Body</span><div className="dn-mail__body"><p>Paste the order summary so we can read it without opening files.</p><Button size="sm" variant="secondary" onClick={copySummary}>Copy order summary</Button></div></li>
          </ol>
          <p className="dn-mail__fine">If your email app doesn't open from this page, copy the address above into a new message.</p>
        </section>
      )}

      <div className="dn-grid">
        <section className="ord-panel dn-files" aria-labelledby="dn-files-h">
          <h2 className="ord-panel__h" id="dn-files-h">{sent ? "Your copies" : "Files to send"}</h2>
          <ul className="dn-filelist" role="list">
            <FileRow
              icon={<Package />}
              title="Design pack"
              ext=".zip"
              desc="Print artwork as a 2048 px PNG, every garment front and back at 1200 px, plus the order sheet, roster and order data. Takes a few seconds to build."
              state={files.pack}
              onClick={dlPack}
            />
            <FileRow
              icon={<FileText />}
              title="Order sheet"
              ext=".html"
              desc="Mockups, placements, sizes, roster and totals on one printable page. Opens in any browser."
              state={files.sheet}
              onClick={dlSheet}
            />
            <FileRow
              icon={<FileSpreadsheet />}
              title="Roster"
              ext=".csv"
              desc="Players, numbers, sizes and pieces, plus extras. Opens in Excel or Google Sheets."
              state={files.csv}
              onClick={dlCsv}
            />
          </ul>
        </section>

        <section className="ord-panel dn-steps" aria-labelledby="dn-steps-h">
          <h2 className="ord-panel__h" id="dn-steps-h">What happens next</h2>
          <ol className="dn-timeline" role="list">
            {steps.map((s, i) => (
              <li key={s.k} className={cx("dn-step", s.state && `is-${s.state}`)}>
                <span className="dn-step__dot" aria-hidden="true">{s.state === "done" ? <Check /> : String(i + 1).padStart(2, "0")}</span>
                <div className="dn-step__main">
                  <div className="dn-step__head"><strong>{s.k}</strong><SpecLabel>{s.when}</SpecLabel></div>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <KitNotice kit={kit} />

      <section className="ord-panel dn-kit" aria-labelledby="dn-kit-h">
        <div className="dn-kit__head">
          <h2 className="ord-panel__h" id="dn-kit-h">The kit</h2>
          <SpecLabel>{plural(ids.length, "piece")} · {plural(t.players, "player")} · {t.units} total</SpecLabel>
        </div>
        <ul className="dn-kit__list" role="list">
          {ids.map((id) => (
            <li key={id}>
              <CanvasImage canvas={mockups[id]?.front || null} error={!mockups[id]?.front ? placeholderText(kit) : null} ratio={1} stage="none" padding={0.05} className="ord-gstage" alt={byId[id]?.name || id} />
              <span>{byId[id]?.name || id}</span>
            </li>
          ))}
        </ul>
        <div className="dn-kit__actions">
          <Button variant="secondary" icon={<Pencil aria-hidden="true" />} onClick={editOrder}>Edit order</Button>
          <Button variant="ghost" icon={<RotateCcw aria-hidden="true" />} onClick={startNew}>Start a new order</Button>
          <Button variant="ghost" href="#review" icon={<ArrowLeft aria-hidden="true" />}>View the order sheet</Button>
        </div>
      </section>

      {inbox.status !== "hidden" && inbox.status !== "checking" && <OrderInboxView inbox={inbox} />}
    </div>
  );
}
