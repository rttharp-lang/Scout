// Extras — gear for coaches, staff and fans: quantities per garment × size, on top of
// the roster. Collapsed by default; one tab per garment.
import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button, NumberStepper, SpecLabel, TabPanel, Tabs, cx } from "../components/index.js";
import { PRODUCTS, SIZE_GROUPS } from "../../order/catalog.js";
import { extrasUnits, formatMoney } from "../../order/pricing.js";
import { plural, productName } from "./util.js";

export function Extras({ extras, setExtras, ids, byId, locked = false, defaultOpen = false }) {
  const total = extrasUnits(extras, ids);
  const [open, setOpen] = useState(defaultOpen || false);
  const [tab, setTab] = useState(ids[0]);
  useEffect(() => { if (!ids.includes(tab)) setTab(ids[0]); }, [ids, tab]);

  const setQty = (g, size, n) =>
    setExtras((ex) => {
      const bySize = { ...(ex?.[g] || {}) };
      if (n > 0) bySize[size] = n; else delete bySize[size];
      const next = { ...(ex || {}) };
      if (Object.keys(bySize).length) next[g] = bySize; else delete next[g];
      return next;
    });
  const clearGarment = (g) => setExtras((ex) => { const next = { ...(ex || {}) }; delete next[g]; return next; });

  const tabs = ids.map((g) => ({ id: g, label: productName(g, byId[g]), count: extrasUnits({ [g]: extras?.[g] }) || undefined }));

  return (
    <section className={cx("ord-panel ord-extras", open && "is-open")} aria-labelledby="ord-extras-h">
      <h2 className="ord-panel__h" id="ord-extras-h">
        <button type="button" className="ord-extras__toggle" aria-expanded={open} aria-controls="ord-extras-body" onClick={() => setOpen((o) => !o)}>
          <span className="ord-extras__title">
            <span>Extras for coaches, staff &amp; fans</span>
            <span className="ord-extras__sub">{total ? `${plural(total, "extra piece")} added` : "Optional. Same gear, sold by size, no names or numbers."}</span>
          </span>
          {total > 0 && <SpecLabel variant="team">{total}</SpecLabel>}
          <ChevronDown aria-hidden="true" className="ord-extras__chev" />
        </button>
      </h2>
      <div id="ord-extras-body" hidden={!open}>
        {ids.length === 0 ? (
          <p className="muted">No garments in the kit yet.</p>
        ) : (
          <>
            <Tabs tabs={tabs} value={tab} onChange={setTab} idBase="ord-extras" label="Garment" size="sm" />
            {tab && (
              <TabPanel idBase="ord-extras" value={tab} className="ord-extras__panel">
                <div className="ord-extras__meta">
                  <SpecLabel k="Each" v={formatMoney(PRODUCTS[tab]?.price)} />
                  {extras?.[tab] && <Button variant="ghost" size="sm" onClick={() => clearGarment(tab)} disabled={locked}>Clear {productName(tab, byId[tab])}</Button>}
                </div>
                {SIZE_GROUPS.map((grp) => (
                  <div key={grp.id} className="ord-extras__group">
                    <SpecLabel className="ord-extras__glabel">{grp.label}</SpecLabel>
                    <div className="ord-extras__sizes">
                      {grp.sizes.map((size) => {
                        const v = Number(extras?.[tab]?.[size]) || 0;
                        return (
                          <div key={size} className={cx("ord-extras__cell", v > 0 && "has-qty")}>
                            <span className="ord-extras__size" aria-hidden="true">{size}</span>
                            <NumberStepper size="sm" value={v} min={0} max={500} label={`${productName(tab, byId[tab])} extras, size ${size}`} onChange={(n) => setQty(tab, size, n)} disabled={locked} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </TabPanel>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default Extras;
