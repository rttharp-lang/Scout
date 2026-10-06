// Mascot Lab — building and submitting an order request.
//
//   buildOrder(state, ctx)  → the order body (plain JSON, no big images)
//   submitOrder(order)      → Promise<{ ok, channel: "artifact-db" | "endpoint" | "local",
//                                       ref, message, stored?, fallbackReason? }>
//
// submitOrder tries, in order:
//   (a) the claude.ai Artifact `db` capability → collection "orders", doc <ref>
//   (b) import.meta.env.VITE_ORDER_ENDPOINT    → POST JSON
//   (c) this device (localStorage "mascot-lab:orders")
// and reports truthfully which one happened. A refused db write (e.g. a viewer who
// can't write shared data gets `invalid_argument`) or a failed POST falls through to
// the next channel, and the returned message says so. It never throws.
//
// Owner inbox helpers: ownerInboxAccess(), watchOrders(), setOrderStatus().
import { getCapability } from "../platform/claude.js";
import * as storage from "../platform/storage.js";
import { CONTACT_EMAIL } from "../brand.js";
import { LEAD_TIME, MIN_ORDER_UNITS, PROOF_TIME, PRODUCTS } from "./catalog.js";
import { countedRows, orderGarmentIds, quantities as computeQuantities, rowIncludes, totals as computeTotals } from "./pricing.js";
import { describeLettering, describePlacement, describeSettings } from "./orderSheet.js";
import { resolveParams } from "../engine/render.js";
import { getDropStyle, resolveColors } from "../apparel/collection.js";

export const ORDERS_COLLECTION = "orders";
export const LOCAL_ORDERS_KEY = "mascot-lab:orders";
export const ORDER_STATUSES = [
  { id: "requested", label: "Requested" },
  { id: "proof-sent", label: "Proof sent" },
  { id: "approved", label: "Approved" },
  { id: "in-production", label: "In production" },
  { id: "shipped", label: "Shipped" },
  { id: "cancelled", label: "Cancelled" },
];
const MAX_DOC_BYTES = 250 * 1024;   // db documents must stay under 256 KiB
const ENDPOINT_TIMEOUT_MS = 15000;
const LOCAL_KEEP = 20;
const ENV = (() => { try { return import.meta.env || {}; } catch { return {}; } })();

/* ───────────────────────────── refs ───────────────────────────── */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** teamInitials({ school, mascot }) → "NB" (school words, else school + mascot), A–Z, 2–3 letters. */
export function teamInitials(team = {}) {
  const words = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const school = words(team.school).filter((w) => !["HS", "HIGH", "SCHOOL", "THE", "OF", "ACADEMY"].includes(w));
  let letters = school.length >= 2 ? school.slice(0, 3).map((w) => w[0]) : [...school.slice(0, 1).map((w) => w[0]), ...words(team.mascot).slice(0, 1).map((w) => w[0])];
  letters = letters.filter((ch) => /[A-Z]/.test(ch));
  if (letters.length === 1) letters.push(school[0]?.[1] || "X");
  return letters.length ? letters.join("").slice(0, 3) : "ML";
}

/** makeRef(team) → "NB-4F7K2": team initials + 5 Crockford base32 characters. */
export function makeRef(team) {
  const bytes = new Uint8Array(5);
  try { crypto.getRandomValues(bytes); } catch { for (let i = 0; i < 5; i++) bytes[i] = (Date.now() / (i + 1)) & 255; }
  let tail = "";
  for (const b of bytes) tail += CROCKFORD[b & 31];
  return `${teamInitials(team)}-${tail}`;
}

/* ───────────────────────────── order body ───────────────────────────── */

const zoneLabel = (garment, view, zone) => garment?.views?.[view]?.zones?.[zone]?.label || String(zone || "").replace(/-/g, " ");

/**
 * buildOrder(state, ctx) → order body.
 * ctx: { ref?, createdAt?, garments: Garment[] (loaded modules, for names/zones),
 *        garmentIds? (order garments; default = enabled + loaded), effect (module | null),
 *        logoThumb? (≤ 30 KB JPEG data URL), rightsConfirmed? }
 */
export function buildOrder(state, ctx = {}) {
  const garmentsById = Object.fromEntries((ctx.garments || []).map((g) => [g.id, g]));
  const ids = ctx.garmentIds || orderGarmentIds(state, ctx.garments ? { garmentIds: Object.keys(garmentsById) } : {});
  const opts = { garmentIds: ids };
  const q = computeQuantities(state, opts);
  const t = computeTotals(state, opts);
  const effect = ctx.effect || null;
  const resolved = effect ? resolveParams(effect, state.effect?.params, state.palette) : {};
  const drop = getDropStyle(state.collection?.dropStyle) || { id: state.collection?.dropStyle, name: state.collection?.dropStyle };

  const garments = ids.map((id) => {
    const g = garmentsById[id];
    const item = state.collection.items[id];
    const colors = resolveColors(item.colors, state.palette);
    const p = PRODUCTS[id];
    return {
      id,
      name: g?.name || p.name,
      product: p.name,
      styleCode: g?.styleCode || "",
      spec: g?.spec || "",
      fabric: g?.fabric || "",
      fit: p.fit,
      price: p.price,
      colors,
      front: (item.front || []).map((pl) => describePlacement(pl, zoneLabel(g, "front", pl.zone))),
      back: (item.back || []).map((pl) => describePlacement(pl, zoneLabel(g, "back", pl.zone))),
      lettering: describeLettering(g, item, colors),
      placements: { front: item.front || [], back: item.back || [] },
      text: item.text || null,
      custom: !!item.custom,
    };
  });

  const roster = countedRows(state.roster).map((r) => ({
    name: String(r.name || "").trim(),
    number: String(r.number || "").trim(),
    top: r.top || "",
    bottom: r.bottom || "",
    items: ids.filter((id) => rowIncludes(r, id)),
  }));
  const extras = {};
  for (const id of ids) {
    const bySize = Object.fromEntries(Object.entries(state.extras?.[id] || {}).map(([z, n]) => [z, Math.max(0, Math.floor(Number(n) || 0))]).filter(([, n]) => n > 0));
    if (Object.keys(bySize).length) extras[id] = bySize;
  }
  const contact = {};
  for (const k of ["coach", "email", "phone", "school", "address", "needBy", "notes"]) contact[k] = String(state.contact?.[k] ?? "").trim();

  return {
    schema: "mascot-lab/order@1",
    ref: ctx.ref || null,
    status: "requested",
    createdAt: ctx.createdAt || new Date().toISOString(),
    team: { school: state.team?.school || "", mascot: state.team?.mascot || "", isSample: !!state.team?.isSample },
    logo: { name: state.logo?.name || "Logo", isSample: !!state.logo?.sampleId, sampleId: state.logo?.sampleId || null, thumb: ctx.logoThumb || null },
    palette: { ...state.palette },
    effect: {
      id: state.effect?.id,
      name: effect?.name || titleCase(state.effect?.id),
      method: effect?.method || "Screen print",
      seed: state.effect?.seed ?? 7,
      params: { ...(state.effect?.params || {}) },
      resolved,
      settings: effect ? describeSettings(effect, resolved, state.effect?.params) : [],
    },
    design: { dropStyle: drop.id, dropStyleName: drop.name, dropStyleNote: drop.note || drop.blurb || "" },
    garments,
    roster,
    extras,
    quantities: q,
    totals: t,
    contact,
    rightsConfirmed: !!ctx.rightsConfirmed,
    terms: { leadTime: LEAD_TIME, proofTime: PROOF_TIME, minUnits: MIN_ORDER_UNITS },
    app: { name: "Mascot Lab", version: 1 },
  };
}

function titleCase(id) {
  return String(id || "Effect").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** jsonBytes(obj) → serialized UTF-8 size. */
export function jsonBytes(obj) {
  const text = JSON.stringify(obj);
  try { return new TextEncoder().encode(text).length; } catch { return text.length * 2; }
}

/** fitForDb(body) → a plain-JSON copy under MAX_DOC_BYTES (drops the thumbnail, then raw placements, if needed). */
export function fitForDb(body) {
  let doc = JSON.parse(JSON.stringify(body));
  if (jsonBytes(doc) <= MAX_DOC_BYTES) return doc;
  doc.logo = { ...doc.logo, thumb: null };
  if (jsonBytes(doc) <= MAX_DOC_BYTES) return doc;
  doc.garments = doc.garments.map(({ placements, ...g }) => g);
  if (jsonBytes(doc) <= MAX_DOC_BYTES) return doc;
  const err = new Error("The order is too large to send in one piece.");
  err.code = "too_large";
  throw err;
}

/* ───────────────────────────── local copies ───────────────────────────── */

/** localOrders() → [{ ref, createdAt, channel, order }] newest first (never throws). */
export function localOrders() {
  const list = storage.load(LOCAL_ORDERS_KEY, []);
  return Array.isArray(list) ? list.filter((x) => x && x.ref) : [];
}

/** findLocalOrder(ref) → the stored entry or null. */
export function findLocalOrder(ref) {
  return localOrders().find((x) => x.ref === ref) || null;
}

function saveLocal(body, channel, reason = null) {
  const entry = { ref: body.ref, createdAt: body.createdAt, channel, reason, order: body };
  const rest = localOrders().filter((x) => x.ref !== body.ref);
  let res = storage.save(LOCAL_ORDERS_KEY, [entry, ...rest].slice(0, LOCAL_KEEP));
  if (!res.ok && res.reason === "quota") {
    // make room: keep only this order, without its thumbnail
    const slim = { ...entry, order: { ...body, logo: { ...body.logo, thumb: null } } };
    res = storage.save(LOCAL_ORDERS_KEY, [slim]);
  }
  return res;
}

/* ───────────────────────────── submit ───────────────────────────── */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function dbReason(e) {
  const code = e?.code || "unavailable";
  if (code === "invalid_argument") return { code, text: "this page can't send orders from your account" };
  if (code === "too_large") return { code, text: "the order was too large to send" };
  if (code === "quota_exceeded" || code === "resource_exhausted") return { code, text: "the order inbox is full right now" };
  if (code === "revoked" || code === "not_granted" || code === "capability_disabled" || code === "capability_removed") return { code, text: "the order inbox isn't available on this page" };
  return { code, text: "the order inbox didn't answer" };
}

async function postJson(url, body) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ENDPOINT_TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctrl?.signal,
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const sentMessage = (email) =>
  `Order request sent. We'll email a proof to ${email || "you"} within ${PROOF_TIME}.`;

/**
 * submitOrder(order) → Promise<{ ok, channel, ref, message, stored?, fallbackReason?, attempts }>.
 * `order` is a buildOrder() body; a missing ref/createdAt is filled in.
 */
export async function submitOrder(order) {
  const body = { ...order, status: "requested" };
  body.ref = body.ref || makeRef(body.team);
  body.createdAt = body.createdAt || new Date().toISOString();
  const ref = body.ref;
  const attempts = [];
  const reasons = [];

  // (a) claude.ai Artifact db
  let db = null;
  try { db = await getCapability("db"); } catch { db = null; }
  if (db && typeof db.collection === "function") {
    try {
      const doc = fitForDb({ ...body, channel: "artifact-db" });
      const ref_ = db.collection(ORDERS_COLLECTION).doc(ref);
      try {
        await ref_.set(doc);
      } catch (e) {
        if ((e?.code || "unavailable") !== "unavailable") throw e;
        await wait(600 + Math.floor(Math.random() * 600));
        await ref_.set(doc);
      }
      attempts.push({ channel: "artifact-db", ok: true });
      saveLocal({ ...body, channel: "artifact-db" }, "artifact-db");
      return { ok: true, channel: "artifact-db", ref, message: sentMessage(body.contact?.email), attempts };
    } catch (e) {
      const r = dbReason(e);
      attempts.push({ channel: "artifact-db", ok: false, code: r.code, error: String(e?.message || e) });
      reasons.push(r.text);
    }
  }

  // (b) site owner's endpoint
  const endpoint = ENV.VITE_ORDER_ENDPOINT;
  if (endpoint) {
    try {
      await postJson(endpoint, { ...body, channel: "endpoint" });
      attempts.push({ channel: "endpoint", ok: true });
      saveLocal({ ...body, channel: "endpoint" }, "endpoint");
      return { ok: true, channel: "endpoint", ref, message: sentMessage(body.contact?.email), attempts };
    } catch (e) {
      const status = e?.status ? ` (error ${e.status})` : e?.name === "AbortError" ? " in time" : "";
      attempts.push({ channel: "endpoint", ok: false, error: String(e?.message || e) });
      reasons.push(`we couldn't reach the order inbox${status}`);
    }
  }

  // (c) this device
  const saved = saveLocal({ ...body, channel: "local" }, "local", reasons.length ? reasons.join("; ") : null);
  attempts.push({ channel: "local", ok: saved.ok, reason: saved.ok ? undefined : saved.reason });
  const why = reasons.length
    ? `${capitalize(reasons[0])}, so`
    : "This preview isn't connected to an order inbox yet, so";
  if (saved.ok) {
    return {
      ok: true,
      channel: "local",
      ref,
      stored: true,
      fallbackReason: reasons.length ? reasons.join("; ") : null,
      message: `${why} your order was saved on this device. Download the order pack and email it to ${CONTACT_EMAIL}.`,
      attempts,
    };
  }
  return {
    ok: false,
    channel: "local",
    ref,
    stored: false,
    fallbackReason: reasons.length ? reasons.join("; ") : null,
    message: `${why.replace(/, so$/, "")}, and this browser won't let us save it either. Download the order pack now and email it to ${CONTACT_EMAIL}.`,
    attempts,
  };
}

const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/* ───────────────────────────── owner inbox ───────────────────────────── */

/**
 * ownerInboxAccess() → Promise<{ db, owner: boolean }>. `owner` is true only when the
 * viewer is the artifact's owner AND the db capability is available. Never throws.
 */
export async function ownerInboxAccess() {
  try {
    const [user, db] = await Promise.all([getCapability("user"), getCapability("db")]);
    if (!user || !db || typeof db.collection !== "function") return { db: null, owner: false };
    const owner = typeof user.isOwner === "function" ? !!(await user.isOwner()) : false;
    return { db: owner ? db : null, owner };
  } catch {
    return { db: null, owner: false };
  }
}

/**
 * watchOrders(db, onOrders, onError) → unsubscribe. Subscribes ONCE to the newest 200
 * orders (createdAt desc); onOrders receives [{ id, ...body }].
 */
export function watchOrders(db, onOrders, onError) {
  try {
    const q = db.collection(ORDERS_COLLECTION).orderBy("createdAt", "desc").limit(200);
    return q.onSnapshot(
      (snap) => onOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))),
      (e) => onError?.(e),
    );
  } catch (e) {
    onError?.(e);
    return () => {};
  }
}

/** setOrderStatus(db, ref, status) → Promise<void> (rejects with the db error). */
export function setOrderStatus(db, ref, status) {
  return db.collection(ORDERS_COLLECTION).doc(ref).update({ status, statusAt: new Date().toISOString() });
}

/**
 * likelyChannel() → Promise<"artifact-db" | "endpoint" | "local">: where submitOrder will
 * most likely put the order, so the UI can label the button honestly before sending.
 * (A db write can still be refused; submitOrder reports what actually happened.)
 */
export async function likelyChannel() {
  try {
    const [db, user] = await Promise.all([getCapability("db"), getCapability("user")]);
    if (db && typeof db.collection === "function") {
      let canWrite = null;
      try { canWrite = typeof user?.can === "function" ? await user.can("data.write") : null; } catch { canWrite = null; }
      if (canWrite !== false) return "artifact-db";
    }
  } catch { /* fall through */ }
  return ENV.VITE_ORDER_ENDPOINT ? "endpoint" : "local";
}
