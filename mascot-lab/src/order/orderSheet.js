// Mascot Lab — the order, written out for people: plain text (email body), the
// roster as CSV, and a self-contained printable HTML order sheet (inline CSS,
// embedded data-URL images) a coach can open in any browser and print.
//
// Also the words used everywhere an order is described (Review page, order sheet,
// owner inbox): placements, lettering and effect settings.
//
// `order` is the body built by orderService.buildOrder():
//   { ref, status, createdAt, team, logo, palette, effect: { id, name, method, settings },
//     design: { dropStyleName }, garments: [{ id, name, styleCode, spec, colors, front[],
//     back[], lettering }], quantities, totals, roster, extras, contact, terms }
import { ALL_SIZES, LEAD_TIME, PROOF_TIME } from "./catalog.js";
import { UNSIZED, formatMoney, formatPercent } from "./pricing.js";

const ROLE_NAMES = { primary: "Primary", secondary: "Secondary", accent: "Accent", dark: "Dark", light: "Light" };
/** Short garment names for narrow table columns (the roster on the printed sheet). */
const SHORT = { jersey: "Jersey", shorts: "Shorts", hoodie: "Hoodie", pants: "Pants", tee: "Tee", longsleeve: "Shooter" };
const s = (v) => (v == null ? "" : String(v));

/* ───────────────────────────── words ───────────────────────────── */

/**
 * describePlacement(spec, zoneLabel) → "Effect graphic, oversized (crops right), 112%, one ink #2A3F63".
 * spec = collection PlacementSpec; zoneLabel = the garment's label for spec.zone.
 */
export function describePlacement(p, zoneLabel) {
  if (!p) return "";
  const what = p.source === "logo" ? "Clean logo" : "Effect graphic";
  const zone = s(zoneLabel || p.zone).replace(/\s*·\s*/g, ", ").toLowerCase();
  const parts = [];
  if (p.mode === "tile") {
    parts.push(`${what} as an all-over repeat`);
    const pct = Math.round(((Number(p.tile) || 220) / 1000) * 100);
    parts.push(`motif about ${pct}% of the garment width`);
    if (Number(p.rotate)) parts.push(`turned ${Math.round(Number(p.rotate))}°`);
  } else {
    parts.push(`${what}, ${zone}`);
    const sc = Number(p.scale ?? 1);
    if (Math.abs(sc - 1) >= 0.02) parts.push(`${Math.round(sc * 100)}% of the zone`);
    const dx = Number(p.dx) || 0, dy = Number(p.dy) || 0;
    const nudge = [];
    if (Math.abs(dy) >= 0.05) nudge.push(dy > 0 ? "set low" : "set high");
    if (Math.abs(dx) >= 0.05) nudge.push(dx > 0 ? "nudged right" : "nudged left");
    if (nudge.length) parts.push(nudge.join(" and "));
    if (Number(p.rotate)) parts.push(`turned ${Math.round(Number(p.rotate))}°`);
  }
  if (p.tint && p.tint !== "tonal") parts.push(`one ink ${s(p.tint).toUpperCase()}`);
  else if (p.tint === "tonal") parts.push("one ink, a shade off the base");
  else parts.push("full colour");
  if (p.opacity != null && Number(p.opacity) < 0.99) parts.push(`${Math.round(Number(p.opacity) * 100)}% ink density`);
  return parts.join(", ");
}

/**
 * describeLettering(garment, item, colors) → "Back: name + number. Front: number. Graduate
 * lettering, #FFFFFF fill, #F2A900 outline." or null when the garment carries no lettering.
 */
export function describeLettering(garment, item, colors) {
  if (!item?.text) return null;
  const views = [];
  for (const v of ["front", "back"]) {
    const boxes = garment?.views?.[v]?.text || {};
    const has = [];
    if (item.text.name && boxes.name) has.push("player name");
    if (item.text.number && boxes.number) has.push("number");
    if (has.length) views.push(`${v === "front" ? "Front" : "Back"}: ${has.join(" + ")}`);
  }
  if (!views.length) return null;
  const ink = colors ? `, ${s(colors.accent).toUpperCase()} fill, ${s(colors.trim).toUpperCase()} outline` : "";
  return `${views.join(". ")}. Varsity block lettering${ink}.`;
}

/**
 * describeSettings(effect, resolved, overrides) → [{ key, label, value, changed }] in words.
 * effect: the effect module (param specs); resolved: resolveParams() output;
 * overrides: state.effect.params (to mark what the coach changed, and which colours are roles).
 */
export function describeSettings(effect, resolved = {}, overrides = {}) {
  const out = [];
  for (const spec of effect?.params || []) {
    const v = resolved[spec.key];
    let value = "";
    if (spec.type === "range") {
      const dec = String(spec.step ?? 1).includes(".") ? String(spec.step).split(".")[1].length : 0;
      value = `${Number(v).toFixed(Math.min(dec, 2))}${spec.unit ? (spec.unit === "%" || spec.unit === "°" ? spec.unit : ` ${spec.unit}`) : ""}`;
    } else if (spec.type === "color") {
      const role = typeof overrides?.[spec.key] === "string" ? overrides[spec.key] : spec.default;
      value = ROLE_NAMES[role] ? `${ROLE_NAMES[role]} ${s(v).toUpperCase()}` : s(v).toUpperCase();
    } else if (spec.type === "select") {
      value = (spec.options || []).find((o) => o.value === v)?.label ?? s(v);
    } else if (spec.type === "toggle") {
      value = v ? "On" : "Off";
    } else value = s(v);
    out.push({ key: spec.key, label: spec.label, value, changed: overrides && Object.prototype.hasOwnProperty.call(overrides, spec.key) });
  }
  return out;
}

/** sizesInOrder(quantities) → the catalog sizes (plus TBD) that appear anywhere, in size order. */
export function sizesInOrder(quantities) {
  const present = new Set();
  for (const q of Object.values(quantities || {})) for (const k of Object.keys(q)) if (k !== "total" && q[k] > 0) present.add(k);
  const list = ALL_SIZES.filter((z) => present.has(z));
  if (present.has(UNSIZED)) list.push(UNSIZED);
  return list;
}

export function formatDate(iso, opts = { year: "numeric", month: "short", day: "numeric" }) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return s(iso);
  try { return d.toLocaleDateString("en-US", opts); } catch { return d.toDateString(); }
}

const teamName = (o) => [o?.team?.school, o?.team?.mascot].filter(Boolean).join(" ") || "Team order";

/* ───────────────────────────── plain text ───────────────────────────── */

/** orderText(order) → a plain-text summary (email body / .txt). */
export function orderText(order) {
  const o = order || {};
  const L = [];
  const rule = "-".repeat(56);
  L.push(`MASCOT LAB ORDER REQUEST  ${s(o.ref)}`);
  L.push(`${teamName(o)}  ·  ${formatDate(o.createdAt)}`);
  if (o.replaces) L.push(`Replaces order ${s(o.replaces)}`);
  L.push(rule);
  L.push(`Design: ${s(o.effect?.name)} (${s(o.effect?.method)}), ${s(o.design?.dropStyleName)} drop`);
  if (o.effect?.settings?.length) L.push(`Effect settings: ${o.effect.settings.map((x) => `${x.label} ${x.value}`).join("; ")}`);
  const pal = o.palette || {};
  L.push(`Team colours: ${Object.entries(pal).map(([k, v]) => `${ROLE_NAMES[k] || k} ${v}`).join(", ")}`);
  L.push(`Logo: ${s(o.logo?.name)}${o.logo?.isSample ? " (sample logo)" : ""}`);
  L.push("");
  L.push("GARMENTS");
  for (const g of o.garments || []) {
    const q = o.quantities?.[g.id] || {};
    L.push(`${g.name} (${s(g.styleCode)}) · ${q.total || 0} pcs · base ${s(g.colors?.base)}, trim ${s(g.colors?.trim)}`);
    if (g.front?.length) L.push(`  Front: ${g.front.join("; ")}`);
    if (g.back?.length) L.push(`  Back: ${g.back.join("; ")}`);
    if (g.lettering) L.push(`  Lettering: ${g.lettering}`);
    const sizes = sizesInOrder({ [g.id]: q }).map((z) => `${z} ${q[z]}`).join(", ");
    if (sizes) L.push(`  Sizes: ${sizes}`);
  }
  L.push("");
  L.push(`ROSTER (${(o.roster || []).length} players)`);
  for (const r of o.roster || []) {
    L.push(`  #${s(r.number || "--").padStart(2)}  ${s(r.name || "(no name)").padEnd(24)} top ${s(r.top || UNSIZED).padEnd(4)} bottom ${s(r.bottom || UNSIZED)}`);
  }
  const extraLines = [];
  for (const [id, bySize] of Object.entries(o.extras || {})) {
    const g = (o.garments || []).find((x) => x.id === id);
    const sz = Object.entries(bySize && typeof bySize === "object" ? bySize : {}).filter(([, n]) => n > 0).map(([z, n]) => `${z} ${n}`).join(", ");
    if (sz) extraLines.push(`  ${g?.name || id}: ${sz}`);
  }
  if (extraLines.length) { L.push(""); L.push("EXTRAS (coaches, staff, fans)"); L.push(...extraLines); }
  const t = o.totals || {};
  L.push("");
  L.push("TOTALS");
  for (const l of t.lines || []) if (l?.units) L.push(`  ${s(l.name).padEnd(18)} ${String(l.units).padStart(4)} × ${formatMoney(l.price).padStart(5)} = ${formatMoney(l.amount)}`);
  L.push(`  Subtotal ${formatMoney(t.subtotal)}`);
  if (t.discount) L.push(`  Volume discount (${formatPercent(t.tier?.off)}, ${t.tier?.min}+ items) −${formatMoney(t.discount)}`);
  if (t.decorationFee) L.push(`  Art & setup ${formatMoney(t.decorationFee)}`);
  L.push(`  Estimated total ${formatMoney(t.total)} for ${t.units} items`);
  L.push("");
  const c = o.contact || {};
  L.push("CONTACT & SHIPPING");
  L.push(`  ${s(c.coach)} · ${s(c.email)}${c.phone ? ` · ${c.phone}` : ""}`);
  if (c.school) L.push(`  ${c.school}`);
  if (c.address) L.push(`  Ship to: ${s(c.address).replace(/\n+/g, ", ")}`);
  if (c.needBy) L.push(`  Needed by: ${formatDate(c.needBy)}`);
  if (c.notes) L.push(`  Notes: ${s(c.notes).replace(/\n+/g, " ")}`);
  L.push("");
  L.push(`Proof within ${PROOF_TIME}. Production ${LEAD_TIME}. Prices are estimates until the proof is approved.`);
  if (o.rightsConfirmed) L.push("The coach confirmed they own this logo or have permission to use it.");
  return L.join("\n");
}

/* ───────────────────────────── CSV ───────────────────────────── */

function csvCell(v) {
  let t = s(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // spreadsheet formula guard
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * rosterCsv(order) → CSV: one line per player (garment columns hold 1 when the player
 * gets it), then one line per extra (garment × size, the column holds the quantity).
 */
export function rosterCsv(order) {
  const o = order || {};
  const gs = o.garments || [];
  const head = ["Name", "Number", "Top size", "Bottom size", ...gs.map((g) => g.name), "Line type"];
  const rows = [head];
  for (const r of o.roster || []) {
    const inc = new Set(r.items || []);
    rows.push([r.name, r.number, r.top || UNSIZED, r.bottom || UNSIZED, ...gs.map((g) => (inc.has(g.id) ? 1 : "")), "Player"]);
  }
  for (const g of gs) {
    for (const [size, n] of Object.entries(o.extras?.[g.id] || {})) {
      if (!(n > 0)) continue;
      rows.push(["Extra (coach, staff, fan)", "", g.fit === "bottom" ? "" : size, g.fit === "bottom" ? size : "", ...gs.map((x) => (x.id === g.id ? n : "")), "Extra"]);
    }
  }
  // UTF-8 BOM first: without it Excel (Windows) reads the file as ANSI and "José Núñez"
  // comes out as "JosÃ© NÃºÃ±ez"; Google Sheets and Numbers ignore it
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* ───────────────────────────── HTML order sheet ───────────────────────────── */

const esc = (v) => s(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// the whole URL must be base64 (a prefix check would let `"…` break out of the src attribute)
const okImg = (u) => typeof u === "string" && /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/.test(u);
/** A colour for a style attribute: "#RRGGBB" only (anything else could load url()s). */
const hex = (v) => (/^#[0-9a-f]{6}$/i.test(s(v)) ? s(v) : "transparent");
/** A count for the sheet: a finite number, else 0 (never markup). */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
const inkOn = (hex) => (luminance(hex) > 0.4 ? "#0E1116" : "#FFFFFF");

/**
 * orderSheetHtml(order, images?) → a complete HTML document (string).
 * images: { logo?, look?, garments?: { [garmentId]: { front?, back? } } } as data URLs.
 */
export function orderSheetHtml(order, images = {}) {
  const o = order || {};
  const pal = o.palette || {};
  const t = o.totals || {};
  const c = o.contact || {};
  const gs = o.garments || [];
  const sizes = sizesInOrder(o.quantities);
  const primary = /^#[0-9a-f]{6}$/i.test(pal.primary || "") ? pal.primary : "#13294B";
  const second = /^#[0-9a-f]{6}$/i.test(pal.secondary || "") ? pal.secondary : "#F2A900";
  const logoImg = okImg(images.logo) ? images.logo : okImg(o.logo?.thumb) ? o.logo.thumb : null;
  const lookImg = okImg(images.look) ? images.look : null;

  const swatches = Object.entries(pal).map(([k, v]) => `
      <div class="sw"><span class="chip" style="background:${hex(v)}"></span><span><b>${esc(ROLE_NAMES[k] || k)}</b><code>${esc(v)}</code></span></div>`).join("");

  const settings = (o.effect?.settings || []).map((x) => `<tr><th>${esc(x.label)}</th><td>${esc(x.value)}</td></tr>`).join("");

  const garmentCards = gs.map((g) => {
    const im = images.garments?.[g.id] || {};
    const q = o.quantities?.[g.id] || {};
    const view = (v) => `
        <figure>${okImg(im[v]) ? `<img src="${im[v]}" alt="${esc(g.name)} ${v}">` : `<div class="noimg">${v}</div>`}<figcaption>${v === "front" ? "Front" : "Back"}</figcaption></figure>`;
    const list = (arr) => (arr?.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted">No graphic</p>`);
    return `
    <article class="garment">
      <header><h3>${esc(g.name)}</h3><code>${esc(g.styleCode)}</code><span class="qty">${num(q.total)} pcs</span></header>
      <div class="views">${view("front")}${view("back")}</div>
      <div class="ginfo">
        <p class="spec">${esc(g.spec)}</p>
        <p class="cw"><span class="dot" style="background:${hex(g.colors?.base)}"></span>Base <code>${esc(g.colors?.base)}</code>
          <span class="dot" style="background:${hex(g.colors?.trim)}"></span>Trim <code>${esc(g.colors?.trim)}</code>
          <span class="dot" style="background:${hex(g.colors?.accent)}"></span>Accent <code>${esc(g.colors?.accent)}</code></p>
        <div class="place"><h4>Front</h4>${list(g.front)}<h4>Back</h4>${list(g.back)}${g.lettering ? `<h4>Lettering</h4><p>${esc(g.lettering)}</p>` : ""}</div>
      </div>
    </article>`;
  }).join("");

  const sizeTable = `
    <table class="grid">
      <thead><tr><th>Garment</th>${sizes.map((z) => `<th>${esc(z)}</th>`).join("")}<th class="tot">Total</th></tr></thead>
      <tbody>${gs.map((g) => {
        const q = o.quantities?.[g.id] || {};
        return `<tr><th>${esc(g.name)}</th>${sizes.map((z) => `<td>${num(q[z]) || ""}</td>`).join("")}<td class="tot">${num(q.total)}</td></tr>`;
      }).join("")}</tbody>
    </table>`;

  const rosterRows = (o.roster || []).map((r, i) => {
    const inc = new Set(r.items || []);
    return `<tr><td class="n">${i + 1}</td><td>${esc(r.name) || '<span class="muted">No name</span>'}</td><td class="num">${esc(r.number) || "–"}</td><td>${esc(r.top || UNSIZED)}</td><td>${esc(r.bottom || UNSIZED)}</td>${gs.map((g) => `<td class="chk">${inc.has(g.id) ? "●" : ""}</td>`).join("")}</tr>`;
  }).join("");

  const extras = gs.flatMap((g) => Object.entries(o.extras?.[g.id] || {}).filter(([, n]) => n > 0).map(([z, n]) => `<tr><td>${esc(g.name)}</td><td>${esc(z)}</td><td class="num">${num(n)}</td></tr>`)).join("");

  const lines = (t.lines || []).filter((l) => l.units).map((l) => `<tr><td>${esc(l.name)}</td><td class="num">${num(l.units)}</td><td class="num">${formatMoney(l.price)}</td><td class="num">${formatMoney(l.amount)}</td></tr>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Order ${esc(o.ref)} · ${esc(teamName(o))}</title>
<style>
  :root { --ink:#0E1116; --ink2:#4C5562; --line:#D3D9E1; --soft:#F3F5F8; --team:${esc(primary)}; --team2:${esc(second)}; }
  * { box-sizing: border-box; margin: 0; }
  body { font: 13px/1.45 "Helvetica Neue", Arial, system-ui, sans-serif; color: var(--ink); background: #E7EAEE; padding: 24px; }
  .sheet { max-width: 1000px; margin: 0 auto; background: #fff; padding: 36px 40px 40px; box-shadow: 0 2px 16px rgb(0 0 0 / .12); }
  h1, h2, h3, h4 { font-family: "Big Shoulders Display", "Arial Narrow", "Roboto Condensed", Impact, sans-serif; font-stretch: condensed; text-transform: uppercase; letter-spacing: .01em; line-height: 1; }
  h1 { font-size: 34px; font-weight: 900; }
  h2 { font-size: 18px; font-weight: 800; padding-bottom: 6px; border-bottom: 2px solid var(--ink); margin: 28px 0 12px; display: flex; justify-content: space-between; align-items: baseline; }
  h2 small { font: 500 10px/1 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .08em; color: var(--ink2); }
  h3 { font-size: 18px; font-weight: 800; }
  h4 { font: 600 10px/1.2 ui-monospace, Menlo, Consolas, monospace; text-transform: uppercase; letter-spacing: .08em; color: var(--ink2); margin: 8px 0 3px; }
  code, .mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; letter-spacing: .04em; }
  .muted { color: var(--ink2); }
  .stripe { height: 8px; background: linear-gradient(to bottom, var(--team) 0 5px, var(--team2) 5px 8px); margin: -36px -40px 28px; }
  .top { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: end; }
  .kicker { font: 600 10px/1 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--ink2); margin-bottom: 8px; }
  .ref { text-align: right; }
  .ref b { display: block; font: 700 28px/1 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .04em; white-space: nowrap; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--line); margin-top: 18px; }
  .meta div { padding: 8px 10px; border-left: 1px solid var(--line); }
  .meta div:first-child { border-left: 0; }
  .meta div > span:first-child { display: block; font: 500 9.5px/1.2 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; color: var(--ink2); margin-bottom: 3px; }
  .design { display: grid; grid-template-columns: 180px 1fr 1fr; gap: 20px; align-items: start; }
  .art { aspect-ratio: 1; background: #F1EFE9 center/contain no-repeat; border: 1px solid var(--line); display: grid; place-items: center; }
  .art img { width: 100%; height: 100%; object-fit: contain; }
  table { border-collapse: collapse; width: 100%; }
  .kv th { text-align: left; font-weight: 600; padding: 3px 12px 3px 0; color: var(--ink2); width: 45%; vertical-align: top; }
  .kv td { padding: 3px 0; }
  .sws { display: grid; gap: 6px; }
  .sw { display: flex; gap: 8px; align-items: center; }
  .sw .chip { width: 26px; height: 26px; border-radius: 3px; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .15); flex: none; }
  .sw span:last-child { display: grid; line-height: 1.2; }
  .garments { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .garment { border: 1px solid var(--line); padding: 12px 14px 14px; break-inside: avoid; }
  .garment header { display: flex; gap: 10px; align-items: baseline; }
  .garment header .qty { margin-left: auto; font: 600 12px ui-monospace, Menlo, Consolas, monospace; }
  .views { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0 8px; }
  .views figure { background: #F3F4F6; border-radius: 3px; text-align: center; padding: 6px 6px 4px; }
  .views img { width: 100%; aspect-ratio: 1; object-fit: contain; display: block; }
  .views figcaption { font: 500 9.5px ui-monospace, Menlo, Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; color: var(--ink2); }
  .noimg { aspect-ratio: 1; display: grid; place-items: center; color: var(--ink2); font: 500 10px ui-monospace, monospace; text-transform: uppercase; }
  .spec { color: var(--ink2); font-size: 12px; }
  .cw { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; font-size: 12px; margin-top: 4px; }
  .dot { width: 11px; height: 11px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .2); display: inline-block; }
  .cw code { margin-right: 8px; }
  .place ul { padding-left: 16px; }
  .place li, .place p { font-size: 12px; }
  .grid th, .grid td { border: 1px solid var(--line); padding: 5px 7px; text-align: center; font-variant-numeric: tabular-nums; }
  .grid thead th { background: var(--soft); font: 600 10.5px ui-monospace, Menlo, Consolas, monospace; letter-spacing: .06em; }
  .grid tbody th { text-align: left; font-weight: 600; }
  .grid .tot { font-weight: 700; background: var(--soft); }
  .roster th, .roster td { border-bottom: 1px solid var(--line); padding: 4px 6px; text-align: left; font-variant-numeric: tabular-nums; }
  .roster thead th { font: 600 10px ui-monospace, Menlo, Consolas, monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--ink2); border-bottom: 2px solid var(--ink); }
  .roster .n { color: var(--ink2); width: 28px; }
  .roster .num { font-weight: 700; }
  .roster .chk { text-align: center; color: var(--team); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; }
  .money td { padding: 4px 0; border-bottom: 1px solid var(--line); }
  .money .num, .roster td.num { text-align: right; }
  .money tfoot td { border-bottom: 0; padding-top: 8px; }
  .money .grand td { font-size: 18px; font-weight: 800; border-top: 2px solid var(--ink); }
  .contact p { margin-bottom: 4px; }
  .contact .addr { white-space: pre-line; }
  .foot { margin-top: 28px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 11px; color: var(--ink2); display: grid; gap: 4px; }
  .badge { display: inline-block; font: 600 10px ui-monospace, Menlo, Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; padding: 3px 6px; background: var(--team); color: ${inkOn(primary)}; border-radius: 2px; }
  .printbar { max-width: 1000px; margin: 0 auto 12px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--ink2); }
  .printbar button { font: 700 13px/1 system-ui, sans-serif; padding: 9px 14px; border: 0; border-radius: 3px; background: var(--ink); color: #fff; cursor: pointer; }
  @media (max-width: 760px) {
    body { padding: 0; } .sheet { padding: 24px 18px; } .stripe { margin: -24px -18px 20px; }
    .top { grid-template-columns: 1fr; gap: 12px; } .ref { text-align: left; } .ref b { font-size: 22px; } h1 { font-size: 28px; }
    .design, .garments, .two { grid-template-columns: 1fr; } .meta { grid-template-columns: 1fr 1fr; }
    .meta div:nth-child(3) { border-left: 0; } .grid { font-size: 11px; } .printbar { padding: 10px 18px; margin: 0; }
  }
  .roster th.g { text-align: center; }
  .roster td:nth-child(2) { white-space: nowrap; }
  @media print {
    /* A4 and Letter: 12–14 mm margins, garments as full-width rows (views left, spec right)
       so the kit fits two pages and nothing splits across a page edge */
    body { background: #fff; padding: 0; font-size: 11px; } .sheet { box-shadow: none; padding: 0; max-width: none; }
    .stripe { margin: 0 0 16px; } .printbar { display: none; }
    h1 { font-size: 28px; } h2 { margin: 18px 0 8px; font-size: 16px; break-after: avoid; }
    .meta { margin-top: 12px; }
    .design { grid-template-columns: 34mm 1fr 34mm; gap: 14px; }
    .kv th, .kv td { padding: 1.5px 10px 1.5px 0; } .kv th { width: 36%; }
    .sws { gap: 4px; } .sw .chip { width: 20px; height: 20px; }
    .garments { grid-template-columns: 1fr; gap: 8px; }
    .garment { display: grid; grid-template-columns: 70mm minmax(0, 1fr); grid-template-areas: "head head" "views info"; column-gap: 14px; padding: 8px 10px 10px; break-inside: avoid; }
    .garment header { grid-area: head; }
    .views { grid-area: views; margin: 6px 0 0; gap: 6px; align-self: start; }
    .views figure { padding: 3px 3px 2px; }
    .ginfo { grid-area: info; padding-top: 6px; }
    .place li, .place p, .spec, .cw { font-size: 10.5px; }
    .grid th, .grid td { padding: 3px 6px; }
    .roster th, .roster td { padding: 2.5px 6px; }
    .two { gap: 20px; }
    .foot { margin-top: 16px; }
    h2, .garment, tr, .two > div, .foot { break-inside: avoid; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  @page { margin: 12mm 13mm; }
</style>
</head>
<body>
<div class="printbar"><span>Order sheet ${esc(o.ref)}. Print it or save it as a PDF from your browser.</span><button type="button" onclick="window.print()">Print</button></div>
<main class="sheet">
  <div class="stripe"></div>
  <section class="top">
    <div>
      <p class="kicker">Mascot Lab · Team order sheet</p>
      <h1>${esc(teamName(o))}</h1>
    </div>
    <div class="ref"><p class="kicker">Order ref</p><b>${esc(o.ref)}</b></div>
  </section>
  <div class="meta">
    <div><span>Requested</span>${esc(formatDate(o.createdAt))}</div>
    <div><span>Status</span><span class="badge">${esc(o.status === "requested" ? "Awaiting proof" : s(o.status))}</span></div>
    <div><span>Items</span>${num(t.units)} pieces · ${(o.roster || []).length} players</div>
    <div><span>Need by</span>${c.needBy ? esc(formatDate(c.needBy)) : "Not given"}</div>
  </div>

  <h2>Design <small>${esc(o.effect?.method)}</small></h2>
  <div class="design">
    <div class="art">${lookImg ? `<img src="${lookImg}" alt="Chosen look">` : logoImg ? `<img src="${logoImg}" alt="Logo">` : ""}</div>
    <div>
      <table class="kv">
        <tr><th>Logo</th><td>${esc(o.logo?.name)}${o.logo?.isSample ? " (sample)" : ""}</td></tr>
        <tr><th>Effect</th><td><b>${esc(o.effect?.name)}</b></td></tr>
        <tr><th>Print method</th><td>${esc(o.effect?.method)}</td></tr>
        <tr><th>Drop style</th><td>${esc(o.design?.dropStyleName)}</td></tr>
        ${settings}
      </table>
    </div>
    <div class="sws">${swatches}</div>
  </div>

  <h2>Garments <small>${gs.length} pieces in the kit</small></h2>
  <div class="garments">${garmentCards}</div>

  <h2>Size breakdown <small>Players + extras</small></h2>
  ${sizeTable}

  <h2>Roster <small>${(o.roster || []).length} players</small></h2>
  <table class="roster">
    <thead><tr><th></th><th>Name</th><th style="text-align:right">No.</th><th>Top</th><th>Bottom</th>${gs.map((g) => `<th class="g" title="${esc(g.name)}">${esc(SHORT[g.id] || g.name)}</th>`).join("")}</tr></thead>
    <tbody>${rosterRows || `<tr><td colspan="${5 + gs.length}" class="muted">No players listed.</td></tr>`}</tbody>
  </table>
  ${extras ? `<h2>Extras <small>Coaches, staff and fans</small></h2><table class="roster"><thead><tr><th>Garment</th><th>Size</th><th style="text-align:right">Qty</th></tr></thead><tbody>${extras}</tbody></table>` : ""}

  <div class="two">
    <div>
      <h2>Totals <small>Estimate</small></h2>
      <table class="money">
        <tbody>${lines}</tbody>
        <tfoot>
          <tr><td>Subtotal</td><td></td><td></td><td class="num">${formatMoney(t.subtotal)}</td></tr>
          ${t.discount ? `<tr><td>Volume discount ${formatPercent(t.tier?.off)} (${num(t.tier?.min)}+ items)</td><td></td><td></td><td class="num">−${formatMoney(t.discount)}</td></tr>` : ""}
          ${t.decorationFee ? `<tr><td>Art &amp; setup</td><td></td><td></td><td class="num">${formatMoney(t.decorationFee)}</td></tr>` : ""}
          <tr class="grand"><td>Estimated total</td><td></td><td></td><td class="num">${formatMoney(t.total)}</td></tr>
        </tfoot>
      </table>
    </div>
    <div class="contact">
      <h2>Contact &amp; shipping</h2>
      <p><b>${esc(c.coach)}</b></p>
      <p>${esc(c.email)}${c.phone ? ` · ${esc(c.phone)}` : ""}</p>
      ${c.school ? `<p>${esc(c.school)}</p>` : ""}
      ${c.address ? `<h4>Ship to</h4><p class="addr">${esc(c.address)}</p>` : ""}
      ${c.notes ? `<h4>Notes</h4><p class="addr">${esc(c.notes)}</p>` : ""}
    </div>
  </div>

  <div class="foot">
    <p>Proof within ${esc(PROOF_TIME)} of the request. Production ${esc(LEAD_TIME)}. Prices are estimates until the proof is approved; mockups are previews and colours are confirmed on the printed proof.</p>
    ${o.rightsConfirmed ? "<p>The coach confirmed they own this logo or have permission to use it.</p>" : ""}
  </div>
</main>
</body>
</html>
`;
}
