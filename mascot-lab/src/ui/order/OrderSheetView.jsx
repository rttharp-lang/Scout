// OrderSheetView — the order laid out the way a print shop reads a tech pack: team and
// logo, the look (effect, print method, settings in words), team colours with hex,
// every garment front and back with placements in words, the size breakdown, the
// roster, extras and totals. Rendered from the same order body that gets sent.
import React from "react";
import { Pencil } from "lucide-react";
import { CanvasImage, SpecLabel, Swatch, cx } from "../components/index.js";
import { ALL_SIZES } from "../../order/catalog.js";
import { UNSIZED, formatMoney, formatPercent } from "../../order/pricing.js";
import { formatDate, sizesInOrder } from "../../order/orderSheet.js";
import { shortName } from "./util.js";

const ROLE_LABEL = { primary: "Primary", secondary: "Secondary", accent: "Accent", dark: "Dark", light: "Light" };

function SecHead({ n, title, edit, children }) {
  return (
    <header className="rv-sec__head">
      <h3 className="rv-sec__h"><span className="rv-sec__n">{n}</span>{title}</h3>
      {children}
      {edit && (
        <a className="rv-edit" href={edit.href}>
          <Pencil aria-hidden="true" />
          <span>{edit.label}</span>
        </a>
      )}
    </header>
  );
}

export function OrderSheetView({ order, mockups = {}, art, stage = "paper", logoCanvas, placeholder = null, refLabel = "Assigned when you send", status = "Draft" }) {
  const o = order;
  const t = o.totals;
  const sizes = sizesInOrder(o.quantities);
  const teamName = [o.team.school, o.team.mascot].filter(Boolean).join(" ");
  const extraRows = o.garments.flatMap((g) => ALL_SIZES.filter((z) => o.extras?.[g.id]?.[z] > 0).map((z) => ({ g, z, n: o.extras[g.id][z] })));
  let sec = 0;
  const n = () => String(++sec).padStart(2, "0");

  return (
    <article className="rv-sheet" aria-label="Order sheet">
      <span className="rv-sheet__stripe" aria-hidden="true" />
      <header className="rv-sheet__top">
        <div className="rv-sheet__id">
          <CanvasImage canvas={logoCanvas} error={!logoCanvas && placeholder ? "–" : null} ratio={1} stage="checker" padding={0.08} className="rv-sheet__logo" alt={`${o.logo.name} logo`} />
          <div>
            <SpecLabel>Team order sheet · {status}{o.replaces ? ` · Replaces ${o.replaces}` : ""}</SpecLabel>
            <h2 className="rv-sheet__team">{teamName}</h2>
          </div>
        </div>
        <dl className="rv-meta">
          <div><dt>Ref</dt><dd className={cx(refLabel.length > 10 && "is-note")}>{refLabel}</dd></div>
          <div><dt>Date</dt><dd>{formatDate(o.createdAt)}</dd></div>
          <div><dt>Pieces</dt><dd>{t.units}</dd></div>
          <div><dt>Players</dt><dd>{o.roster.length}</dd></div>
        </dl>
      </header>

      {/* 01 design */}
      <section className="rv-sec">
        <SecHead n={n()} title="Design" edit={{ href: "#studio", label: "Edit look" }} />
        <div className="rv-design">
          <figure className="rv-look">
            <CanvasImage canvas={art} error={!art && placeholder ? placeholder : null} ratio={1} stage={stage} padding={0.02} alt={`${o.effect.name} version of the logo`} />
            <figcaption><SpecLabel k="Artwork" v={`${o.effect.name}`} /></figcaption>
          </figure>
          <div className="rv-design__info">
            <dl className="rv-kv">
              <div><dt>Logo</dt><dd>{o.logo.name}{o.logo.isSample && <SpecLabel variant="warning" className="rv-tag">Sample</SpecLabel>}</dd></div>
              <div><dt>Effect</dt><dd><strong>{o.effect.name}</strong></dd></div>
              <div><dt>Print method</dt><dd>{o.effect.method}</dd></div>
              <div><dt>Drop style</dt><dd><strong>{o.design.dropStyleName}</strong>{o.design.dropStyleNote && <span className="rv-kv__note">{o.design.dropStyleNote}</span>}</dd></div>
            </dl>
            {o.effect.settings.length > 0 && (
              <>
                <h4 className="rv-mini-h">Effect settings</h4>
                <dl className="rv-kv rv-kv--settings">
                  {o.effect.settings.map((s) => (
                    <div key={s.key}><dt>{s.label}</dt><dd>{s.value}{s.changed && <span className="rv-changed" title="You changed this from the default">edited</span>}</dd></div>
                  ))}
                </dl>
              </>
            )}
          </div>
          <div className="rv-colors">
            <h4 className="rv-mini-h">Team colours</h4>
            <ul role="list">
              {Object.entries(o.palette).map(([role, hex]) => (
                <li key={role}><Swatch color={hex} name={ROLE_LABEL[role] || role} showHex size="sm" /></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 02 garments */}
      <section className="rv-sec">
        <SecHead n={n()} title="Garments" edit={{ href: "#collection", label: "Edit kit" }}>
          <SpecLabel>{o.garments.length} {o.garments.length === 1 ? "piece" : "pieces"}</SpecLabel>
        </SecHead>
        <div className="rv-garments">
          {o.garments.map((g) => {
            const m = mockups[g.id] || {};
            return (
              <article key={g.id} className="rv-garment">
                <header className="rv-garment__head">
                  <h4>{g.name}</h4>
                  <SpecLabel variant="box">{g.styleCode || g.id}</SpecLabel>
                  <span className="rv-garment__qty">{o.quantities[g.id]?.total || 0} pcs</span>
                </header>
                <div className="rv-garment__views">
                  {["front", "back"].map((v) => (
                    <figure key={v}>
                      <CanvasImage canvas={m[v] || null} error={!m[v] && placeholder ? placeholder : null} ratio={1} stage="none" padding={0.03} className="ord-gstage" alt={`${g.name}, ${v}`} />
                      <figcaption>{v === "front" ? "Front" : "Back"}</figcaption>
                    </figure>
                  ))}
                </div>
                {g.spec && <p className="rv-garment__spec">{g.spec}</p>}
                <div className="rv-garment__cw" aria-label="Colourway">
                  {["base", "trim", "accent"].map((k) => (
                    <Swatch key={k} color={g.colors[k]} name={k[0].toUpperCase() + k.slice(1)} showHex size="xs" />
                  ))}
                </div>
                <dl className="rv-place">
                  <div><dt>Front</dt><dd>{g.front.length ? g.front.map((x, i) => <p key={i}>{x}</p>) : <p className="muted">No graphic</p>}</dd></div>
                  <div><dt>Back</dt><dd>{g.back.length ? g.back.map((x, i) => <p key={i}>{x}</p>) : <p className="muted">No graphic</p>}</dd></div>
                  {g.lettering && <div><dt>Lettering</dt><dd><p>{g.lettering}</p></dd></div>}
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      {/* 03 sizes */}
      <section className="rv-sec">
        <SecHead n={n()} title="Size breakdown" edit={{ href: "#order", label: "Edit sizes" }}>
          <SpecLabel>Players + extras</SpecLabel>
        </SecHead>
        <div className="rv-tablewrap">
          <table className="rv-sizes">
            <thead>
              <tr>
                <th scope="col">Garment</th>
                {sizes.map((z) => <th scope="col" key={z} className={cx(z === UNSIZED && "is-tbd")}>{z}</th>)}
                <th scope="col" className="rv-tot">Total</th>
              </tr>
            </thead>
            <tbody>
              {o.garments.map((g) => (
                <tr key={g.id}>
                  <th scope="row">{g.name}</th>
                  {sizes.map((z) => <td key={z} className={cx(z === UNSIZED && o.quantities[g.id]?.[z] && "is-tbd")}>{o.quantities[g.id]?.[z] || ""}</td>)}
                  <td className="rv-tot">{o.quantities[g.id]?.total || 0}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">All</th>
                {sizes.map((z) => <td key={z}>{o.garments.reduce((a, g) => a + (o.quantities[g.id]?.[z] || 0), 0) || ""}</td>)}
                <td className="rv-tot">{t.units}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {sizes.includes(UNSIZED) && <p className="rv-note">TBD: sizes you haven't picked yet. Confirm them when you approve the proof.</p>}
      </section>

      {/* 04 roster */}
      <section className="rv-sec">
        <SecHead n={n()} title="Roster" edit={{ href: "#order", label: "Edit roster" }}>
          <SpecLabel>{o.roster.length} players</SpecLabel>
        </SecHead>
        <div className="rv-tablewrap">
          <table className="rv-roster">
            <thead>
              <tr>
                <th scope="col" className="rv-roster__no">No.</th>
                <th scope="col">Name</th>
                <th scope="col">Top</th>
                <th scope="col">Bottom</th>
                {o.garments.map((g) => <th scope="col" key={g.id} className="rv-roster__g" title={g.name}>{shortName(g.id)}</th>)}
              </tr>
            </thead>
            <tbody>
              {o.roster.map((r, i) => {
                const inc = new Set(r.items);
                return (
                  <tr key={i}>
                    <td className="rv-roster__no">{r.number || "–"}</td>
                    <td>{r.name || <span className="muted">No name</span>}</td>
                    <td className={cx(!r.top && "is-tbd")}>{r.top || UNSIZED}</td>
                    <td className={cx(!r.bottom && "is-tbd")}>{r.bottom || UNSIZED}</td>
                    {o.garments.map((g) => <td key={g.id} className="rv-roster__g">{inc.has(g.id) ? <span className="rv-dot" aria-label="Yes" /> : <span className="visually-hidden">No</span>}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {extraRows.length > 0 && (
        <section className="rv-sec">
          <SecHead n={n()} title="Extras" edit={{ href: "#order", label: "Edit extras" }}>
            <SpecLabel>Coaches, staff, fans</SpecLabel>
          </SecHead>
          <ul className="rv-extras" role="list">
            {extraRows.map(({ g, z, n: qty }) => (
              <li key={`${g.id}-${z}`}><span>{g.name}</span><SpecLabel variant="box">{z}</SpecLabel><strong>× {qty}</strong></li>
            ))}
          </ul>
        </section>
      )}

      <section className="rv-sec rv-sec--totals">
        <SecHead n={n()} title="Totals" />
        <table className="rv-money">
          <tbody>
            {t.lines.filter((l) => l.units).map((l) => (
              <tr key={l.garmentId}><th scope="row">{l.name}</th><td>{l.units} × {formatMoney(l.price)}</td><td>{formatMoney(l.amount)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row">Subtotal</th><td /><td>{formatMoney(t.subtotal)}</td></tr>
            {t.discount > 0 && <tr className="is-discount"><th scope="row">Volume discount, {formatPercent(t.tier.off)} on {t.tier.min}+ pieces</th><td /><td>−{formatMoney(t.discount)}</td></tr>}
            <tr><th scope="row">Printing &amp; setup</th><td /><td>{t.decorationFee ? formatMoney(t.decorationFee) : "Included"}</td></tr>
            <tr className="rv-money__total"><th scope="row">Estimated total</th><td /><td>{formatMoney(t.total)}</td></tr>
          </tfoot>
        </table>
      </section>
    </article>
  );
}

export default OrderSheetView;
