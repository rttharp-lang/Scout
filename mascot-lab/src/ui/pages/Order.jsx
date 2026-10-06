// Order — step 3: turn the collection into a priced, sized, roster-ready order.
// Roster (grid / cards) + extras on the left, the running summary on the right
// (sticky on desktop, a bottom bar on smaller screens).
import React, { useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useStore } from "../../state/store.jsx";
import { Button, Notice, SpecLabel, navigate, useToast } from "../components/index.js";
import { MIN_ORDER_UNITS, VOLUME_TIERS } from "../../order/catalog.js";
import { isBlankRow, quantities, totals } from "../../order/pricing.js";
import { RosterEditor } from "../order/RosterEditor.jsx";
import { PasteRoster } from "../order/PasteRoster.jsx";
import { Extras } from "../order/Extras.jsx";
import { MobileBar, OrderSummary } from "../order/OrderSummary.jsx";
import { rosterIssues } from "../order/roster.js";
import { placeholderText, useMockups, useOrderGarments } from "../order/kit.js";
import { KitNotice } from "../order/KitNotice.jsx";
import { findLocalOrder, rememberRevision } from "../../order/orderService.js";
import { plural, submittedTitle } from "../order/util.js";
import "./step.css";
import "./order.css";

/** The first volume tier that takes money off (the intro line names it). */
const FIRST_DISCOUNT = VOLUME_TIERS.filter((t) => t.off > 0).sort((a, b) => a.min - b.min)[0] || null;

/** orderChecks(state, ids, t) → { issues, blockers[], warnings[] } — shared with Review. */
export function orderChecks(state, ids, t) {
  const numbersMatter = ids.some((id) => state.collection.items[id]?.text?.number);
  const issues = rosterIssues(state.roster, ids, { numbersMatter });
  const c = issues.counts;
  const blockers = [];
  const warnings = [];
  if (!ids.length) blockers.push("Switch on at least one garment in your collection.");
  else if (t.units < MIN_ORDER_UNITS) {
    const need = MIN_ORDER_UNITS - t.units;
    blockers.push(`Add ${plural(need, "more item")} to reach the ${MIN_ORDER_UNITS}-piece minimum.`);
  }
  if (c.invalid) blockers.push(`Fix ${plural(c.invalid, "jersey number")}: numbers run 0–99, plus 00.`);
  const dups = Object.keys(issues.duplicates);
  if (dups.length) warnings.push(dups.length === 1 ? `#${dups[0]} is on two players.` : `${dups.length} numbers are on more than one player.`);
  if (t.unsized) warnings.push(`${plural(t.unsized, "piece")} still need a size. You can confirm sizes on the proof.`);
  if (c.missingNumber && numbersMatter) warnings.push(`${plural(c.missingNumber, "player")} without a number.`);
  if (c.missingName) warnings.push(`${plural(c.missingName, "player")} without a name.`);
  // the fictional example players the app opens with would otherwise go to the print shop
  const examples = (state.roster || []).filter((r) => r?.example && !isBlankRow(r)).length;
  if (examples) warnings.push(`${plural(examples, "example player")} from the sample roster ${examples === 1 ? "is" : "are"} still on the order. Clear them unless they're really on your team.`);
  return { issues, blockers, warnings, numbersMatter };
}

export default function Order() {
  const { state, actions } = useStore();
  const { ids, byId, loading } = useOrderGarments();
  const { toast } = useToast();
  const [pasteOpen, setPasteOpen] = useState(false);
  const summaryRef = useRef(null);
  const opts = { garmentIds: ids };
  const t = useMemo(() => totals(state, opts), [state.roster, state.extras, state.collection, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useMemo(() => quantities(state, opts), [state.roster, state.extras, state.collection, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const { issues, blockers, warnings, numbersMatter } = orderChecks(state, ids, t);
  const { mockups, kit } = useMockups(ids, { size: 176, detail: "fast", views: ["front"], priority: 3 });
  const locked = state.order.status === "submitted";

  const onApplyPaste = (rows, mode) => {
    actions.setRoster((cur) => (mode === "replace" ? rows : [...cur.filter((r) => !isBlankRow(r)), ...rows]));
    setPasteOpen(false);
    toast({ tone: "success", title: mode === "replace" ? `Roster replaced: ${plural(rows.length, "player")}` : `Added ${plural(rows.length, "player")}` });
  };
  // keyboard users: the roster is 10+ tab stops per player; this jumps past it
  const skipToSummary = () => {
    const btn = summaryRef.current?.querySelector(".ord-summary__foot .ml-btn:not(:disabled)");
    const target = btn || summaryRef.current;
    target?.scrollIntoView?.({ block: "center" });
    target?.focus({ preventScroll: true });
  };
  const goReview = () => {
    if (blockers.length) return;
    navigate("review");
  };
  const reopen = () => {
    rememberRevision(state.order.ref);
    actions.reopenOrder();
    toast({ title: "Order reopened", body: "Make your changes, then review and send it again." });
  };
  const sent = state.order.channel === "artifact-db" || state.order.channel === "endpoint";

  return (
    <div className="ord-page container">
      <div className="ord-layout">
        <div className="ord-main">
          <header className="pg-head ord-head">
            <SpecLabel size="lg">Step 03 / 03 · Order</SpecLabel>
            <h1 className="pg-title ord-title">Order the kit</h1>
            <p className="lead">
              Add your players and their sizes. The price updates as you go
              {FIRST_DISCOUNT ? `, and the team discount starts at ${FIRST_DISCOUNT.min} pieces.` : "."}
            </p>
          </header>

          {locked && (
            <Notice
              tone="success"
              title={submittedTitle(state.order, sent, !!findLocalOrder(state.order.ref))}
              action={
                <div className="cluster">
                  <Button size="sm" href="#done" icon={<CheckCircle2 aria-hidden="true" />}>See confirmation</Button>
                  <Button size="sm" variant="secondary" onClick={reopen}>Edit order</Button>
                </div>
              }
            >
              The roster is locked so it matches the order sheet. Editing reopens the order, and you send it again for a new proof.
            </Notice>
          )}

          {!loading && ids.length === 0 && (
            <Notice tone="warning" title="No garments in the kit" action={<Button size="sm" variant="secondary" href="#collection">Open the collection</Button>}>
              Every piece is switched off in your collection. Switch on at least one garment to order it.
            </Notice>
          )}

          <KitNotice kit={kit} />

          <section className="ord-panel ord-panel--roster" aria-labelledby="ord-roster-h">
            <button type="button" className="ord-skip" onClick={skipToSummary}>Skip the roster, go to the order summary</button>
            <header className="ord-panel__head">
              <h2 className="ord-panel__h" id="ord-roster-h">Roster</h2>
              <SpecLabel>{plural(t.players, "player")}{ids.length ? ` · ${plural(ids.length, "piece")} each` : ""}</SpecLabel>
            </header>
            <RosterEditor
              roster={state.roster}
              setRoster={actions.setRoster}
              ids={ids}
              issues={issues}
              locked={locked}
              numbersMatter={numbersMatter}
              onPaste={() => setPasteOpen(true)}
            />
          </section>

          <Extras extras={state.extras} setExtras={actions.setExtras} ids={ids} byId={byId} locked={locked} />
        </div>

        <aside className="ord-aside" aria-label="Order summary">
          <OrderSummary
            t={t}
            q={q}
            ids={ids}
            byId={byId}
            mockups={mockups}
            placeholder={placeholderText(kit)}
            blockers={locked ? [] : blockers}
            warnings={warnings}
            onContinue={locked ? undefined : goReview}
            locked={locked}
            summaryRef={summaryRef}
            footExtra={locked ? <Button variant="team" size="lg" block href="#done">See confirmation</Button> : null}
          />
        </aside>
      </div>

      <nav className="ord-nav" aria-label="Step navigation">
        <Button variant="secondary" href="#collection" icon={<ArrowLeft aria-hidden="true" />}>Back: Collection</Button>
      </nav>

      {!locked && (
        <MobileBar
          t={t}
          blocked={blockers.length > 0}
          reason={t.units < MIN_ORDER_UNITS ? `${MIN_ORDER_UNITS - t.units} more to reach the minimum` : blockers[0] ? "Fix the roster first" : ""}
          onContinue={goReview}
          watchRef={summaryRef}
        />
      )}

      <PasteRoster open={pasteOpen} onClose={() => setPasteOpen(false)} onApply={onApplyPaste} roster={state.roster} garmentIds={ids} />
    </div>
  );
}
