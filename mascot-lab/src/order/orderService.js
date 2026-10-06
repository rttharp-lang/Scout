// Mascot Lab — building and submitting an order request.
//
//   buildOrder(state, ctx)  → the order body (plain JSON, no big images)
//   submitOrder(order)      → Promise<{ ok, channel: "artifact-db" | "endpoint" | "local",
//                                       ref, message, stored?, fallbackReason? }>
//
// submitOrder tries, in order:
//   (a) the claude.ai Artifact `db` capability → the viewer's OWN document
//       "orders/<viewer id>" shaped { orders: [ …compact order bodies ] }
//   (b) import.meta.env.VITE_ORDER_ENDPOINT    → POST JSON
//   (c) this device (localStorage "mascot-lab:orders")
// and reports truthfully which one happened. It never throws.
//
// Privacy. The page is published with
//   db: { rules: [ { path: "orders", read: "owner", write: "owner" },
//                  { path: "orders/{self}", write: "interact" } ] }, user: {}
// so each viewer can write only "orders/<their id>" (the id from user.id()), nobody but
// the artifact's owner can read the "orders" collection, and coaches never see each
// other's contact details. No user id → no db channel. A refused write
// (`invalid_argument`: a Viewer/Commenter, or rules that don't allow it) falls through
// to the next channel and the returned message says so.
//
// Owner inbox: ownerInboxAccess(), watchOrders() (one subscription to the collection,
// every viewer document flattened), setOrderStatus() (statuses live in the owner-only
// document "orders/_status", so the owner never rewrites a coach's document).
import { getCapability, inArtifactRuntime } from "../platform/claude.js";
import * as storage from "../platform/storage.js";
import { CONTACT_EMAIL } from "../brand.js";
import { LEAD_TIME, MIN_ORDER_UNITS, PROOF_TIME, PRODUCTS } from "./catalog.js";
import { countedRows, orderGarmentIds, quantities as computeQuantities, rowIncludes, totals as computeTotals } from "./pricing.js";
import { describeLettering, describePlacement, describeSettings } from "./orderSheet.js";
import { sanitizeSvg } from "../engine/sanitizeSvg.js";
import { resolveParams } from "../engine/render.js";
import { getDropStyle, resolveColors } from "../apparel/collection.js";

export const ORDERS_COLLECTION = "orders";
/** Owner-only document beside the viewer documents: { statuses: { [ref]: { status, at } } }. */
export const STATUS_DOC_ID = "_status";
export const LOCAL_ORDERS_KEY = "mascot-lab:orders";
const REVISION_KEY = "mascot-lab:order-revises";
export const ORDER_STATUSES = [
  { id: "requested", label: "Requested" },
  { id: "proof-sent", label: "Proof sent" },
  { id: "approved", label: "Approved" },
  { id: "in-production", label: "In production" },
  { id: "shipped", label: "Shipped" },
  { id: "cancelled", label: "Cancelled" },
];
const MAX_DOC_BYTES = 240 * 1024;   // db documents must stay under 256 KiB
const DOC_KEEP = 10;                // orders kept in one viewer's document (older ones stay on the device)
const THUMB_MAX_CHARS = 9000;       // logo thumbnail kept in the db copy only when it's this small
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
 *        logoThumb? (small JPEG data URL), rightsConfirmed?, replaces? (ref this order revises) }
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
    replaces: ctx.replaces || null,
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

/**
 * compactOrder(body) → the copy stored in the order inbox: plain JSON, no raw placement
 * specs or resolved params (the words describe them), a logo thumbnail only when tiny.
 */
export function compactOrder(body) {
  const doc = JSON.parse(JSON.stringify(body));
  if (doc.logo && typeof doc.logo.thumb === "string" && doc.logo.thumb.length > THUMB_MAX_CHARS) doc.logo = { ...doc.logo, thumb: null };
  if (Array.isArray(doc.garments)) doc.garments = doc.garments.map(({ placements, ...g }) => g);
  if (doc.effect) { const { resolved, ...effect } = doc.effect; doc.effect = effect; }
  return doc;
}

/**
 * fitForDb(orders) → the newest orders (newest first) that fit one document: at most
 * DOC_KEEP and under MAX_DOC_BYTES. Throws { code: "too_large" } when even the newest
 * order alone doesn't fit.
 */
export function fitForDb(orders) {
  let list = orders.slice(0, DOC_KEEP);
  while (list.length > 1 && jsonBytes({ orders: list }) > MAX_DOC_BYTES) list = list.slice(0, -1);
  if (!list.length || jsonBytes({ orders: list }) > MAX_DOC_BYTES) {
    const err = new Error("The order is too large to send in one piece.");
    err.code = "too_large";
    throw err;
  }
  return list;
}

const byNewest = (a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || ""));

/* ───────────────────────────── local copies ───────────────────────────── */

/** localOrders() → [{ ref, createdAt, channel, reason, uid?, order }] newest first (never throws). */
export function localOrders() {
  const list = storage.load(LOCAL_ORDERS_KEY, []);
  return Array.isArray(list) ? list.filter((x) => x && typeof x.ref === "string") : [];
}

/** findLocalOrder(ref) → the stored entry or null. */
export function findLocalOrder(ref) {
  return localOrders().find((x) => x.ref === ref) || null;
}

function saveLocal(body, channel, { reason = null, uid = null } = {}) {
  const entry = { ref: body.ref, createdAt: body.createdAt, channel, reason, uid, order: body };
  const rest = localOrders().filter((x) => x.ref !== body.ref);
  let res = storage.save(LOCAL_ORDERS_KEY, [entry, ...rest].slice(0, LOCAL_KEEP));
  if (!res.ok && res.reason === "quota") {
    // make room: keep only this order, without its thumbnail
    const slim = { ...entry, order: { ...body, logo: { ...body.logo, thumb: null } } };
    res = storage.save(LOCAL_ORDERS_KEY, [slim]);
  }
  return res;
}

/* ───────────────────────────── revisions ───────────────────────────── */

/**
 * rememberRevision(ref) — call before reopening a submitted order: the next order sent
 * from this device carries `replaces: ref`, so the print shop knows which one to drop.
 */
export function rememberRevision(ref) {
  if (ref) storage.save(REVISION_KEY, String(ref));
}
/** pendingRevision() → the ref the next order replaces, or null. */
export function pendingRevision() {
  const r = storage.load(REVISION_KEY, null);
  return typeof r === "string" && r ? r : null;
}
/** clearRevision() — forget it (after a submit, or when starting a new order). */
export function clearRevision() {
  storage.remove(REVISION_KEY);
}

/* ───────────────────────────── submit ───────────────────────────── */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 500 + Math.floor(Math.random() * 600);

function dbReason(e) {
  const code = e?.code || "unavailable";
  if (code === "invalid_argument") return { code, text: "your account can't send orders from this page" };
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

/** retryOnce(fn) — db verbs: one retry after a short randomized delay on `unavailable`. */
async function retryOnce(fn) {
  try {
    return await fn();
  } catch (e) {
    if ((e?.code || "unavailable") !== "unavailable") throw e;
    await wait(jitter());
    return fn();
  }
}

const LOGO_MAX_CHARS = 200 * 1024;  // the logo document (a data URL) stays well under 256 KiB
const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + str.length.toString(36); };
const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
const LOGO_URL = /^data:image\/(png|jpeg|webp|svg\+xml)(;charset=[\w-]+)?;base64,/;

/**
 * storeLogo(db, uid, file) → { path, width, height, type } | null. Keeps an uploaded logo
 * beside the viewer's orders ("orders/<uid>/logos/logo-<hash>", same private subtree) so
 * the print shop can build the proof. Best effort: null when it can't be stored.
 */
async function storeLogo(db, uid, file) {
  if (!file || typeof file.dataUrl !== "string" || !LOGO_URL.test(file.dataUrl) || file.dataUrl.length > LOGO_MAX_CHARS) return null;
  const path = `${ORDERS_COLLECTION}/${uid}/logos/logo-${fnv(file.dataUrl)}`;
  const meta = { path, width: Number(file.width) || null, height: Number(file.height) || null, type: file.dataUrl.slice(5, file.dataUrl.indexOf(";")) };
  try {
    const ref = db.doc(path);
    let exists = false;
    try { exists = !!(await ref.get())?.exists; } catch { exists = false; }
    if (!exists) await retryOnce(() => ref.set({ name: String(file.name || "logo"), dataUrl: file.dataUrl, width: meta.width, height: meta.height, at: new Date().toISOString() }));
    return meta;
  } catch {
    return null;
  }
}

/**
 * fetchOrderLogo(db, order) → Promise<{ blob, filename } | null> — owner inbox: the logo a
 * coach's order carries. The path is checked against the coach's own subtree.
 */
export async function fetchOrderLogo(db, order) {
  const path = order?.logo?.file?.path;
  const parts = typeof path === "string" ? path.split("/") : [];
  if (parts.length !== 4 || parts[0] !== ORDERS_COLLECTION || parts[1] !== order.from || parts[2] !== "logos" || !parts.every((x) => SEG.test(x))) return null;
  const snap = await retryOnce(() => db.doc(path).get());
  const url = snap?.exists ? snap.data()?.dataUrl : null;
  const m = typeof url === "string" ? /^data:(image\/(png|jpeg|webp|svg\+xml))(?:;charset=[\w-]+)?;base64,(.+)$/.exec(url) : null;
  if (!m) return null;
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // the ref comes from the coach's document: keep it to a plain filename
  const base = String(order.ref || "order").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "order";
  if (m[2] === "svg+xml") {
    // the coach's document is untrusted: never hand the owner an SVG that could run script
    const clean = sanitizeSvg(new TextDecoder().decode(bytes));
    return clean ? { blob: new Blob([clean], { type: "image/svg+xml" }), filename: `${base}-logo.svg` } : null;
  }
  const blob = new Blob([bytes], { type: m[1] });
  if (m[2] === "jpeg") return { blob, filename: `${base}-logo.jpg` };
  if (m[2] === "png") return { blob, filename: `${base}-logo.png` };
  // WebP isn't a download type the Artifact frame allows: re-encode as PNG
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  const png = await new Promise((res) => c.toBlob(res, "image/png"));
  return png ? { blob: png, filename: `${base}-logo.png` } : null;
}

/** viewerId() → this viewer's opaque id from the `user` capability, or null. */
export async function viewerId() {
  try {
    const user = await getCapability("user");
    if (!user || typeof user.id !== "function") return null;
    const id = await user.id();
    return typeof id === "string" && id && id !== STATUS_DOC_ID ? id : null;
  } catch {
    return null;
  }
}

/**
 * appendToViewerDoc(db, uid, body) — get "orders/<uid>", add this order, keep the newest
 * DOC_KEEP that fit, set the whole document. If the viewer can't read their own
 * document back, the orders this device already sent there are merged in instead, so a
 * resend never wipes an earlier order from the inbox.
 */
async function appendToViewerDoc(db, uid, body) {
  const ref = db.doc(`${ORDERS_COLLECTION}/${uid}`);
  let remote = [];
  try {
    const snap = await retryOnce(() => ref.get());
    const data = snap && snap.exists ? snap.data() : null;
    if (data && Array.isArray(data.orders)) remote = data.orders.filter((o) => o && typeof o.ref === "string");
  } catch (e) {
    if (e?.code === "revoked" || e?.code === "not_granted" || e?.code === "capability_disabled") throw e;
    // unreadable: fall back to this device's copies below
  }
  const fromDevice = localOrders().filter((x) => x.channel === "artifact-db" && x.uid === uid && x.order).map((x) => compactOrder(x.order));
  const merged = new Map();
  for (const o of [...remote, ...fromDevice]) if (!merged.has(o.ref)) merged.set(o.ref, o);
  merged.set(body.ref, compactOrder(body));
  const newest = [...merged.values()].sort(byNewest);
  // the new order must survive the trim: put it first among equals
  newest.sort((a, b) => (a.ref === body.ref ? -1 : b.ref === body.ref ? 1 : 0) || byNewest(a, b));
  const list = fitForDb(newest);
  await retryOnce(() => ref.set({ orders: list, updatedAt: new Date().toISOString(), app: "mascot-lab" }));
  return list.length;
}

const sentMessage = (email) =>
  `Order request sent. We'll email a proof to ${email || "you"} within ${PROOF_TIME}.`;

/**
 * submitOrder(order, { logoFile? }) → Promise<{ ok, channel, ref, message, stored?, fallbackReason?, attempts, logoStored? }>.
 * `order` is a buildOrder() body; a missing ref/createdAt is filled in. `logoFile`
 * ({ dataUrl, width, height, name }, uploads only) is kept with a db order for the proof.
 */
export async function submitOrder(order, { logoFile = null } = {}) {
  const body = { ...order, status: "requested" };
  body.ref = body.ref || makeRef(body.team);
  body.createdAt = body.createdAt || new Date().toISOString();
  if (!body.replaces) body.replaces = pendingRevision();
  if (body.replaces === body.ref) body.replaces = null;
  const ref = body.ref;
  const attempts = [];
  const reasons = [];

  // (a) claude.ai Artifact db: this viewer's own document
  let db = null;
  try { db = await getCapability("db"); } catch { db = null; }
  if (db && typeof db.doc === "function") {
    const uid = await viewerId();
    if (!uid) {
      attempts.push({ channel: "artifact-db", ok: false, code: "no_user_id" });
      reasons.push("this page couldn't confirm your account");
    } else {
      try {
        const file = logoFile ? await storeLogo(db, uid, logoFile) : null;
        const sent = { ...body, channel: "artifact-db", logo: { ...body.logo, file } };
        await appendToViewerDoc(db, uid, sent);
        attempts.push({ channel: "artifact-db", ok: true });
        saveLocal(sent, "artifact-db", { uid });
        clearRevision();
        return { ok: true, channel: "artifact-db", ref, message: sentMessage(body.contact?.email), attempts, logoStored: !!file };
      } catch (e) {
        const r = dbReason(e);
        attempts.push({ channel: "artifact-db", ok: false, code: r.code, error: String(e?.message || e) });
        reasons.push(r.text);
      }
    }
  } else if (inArtifactRuntime()) {
    reasons.push("this page can't reach the order inbox for your account");
  }

  // (b) site owner's endpoint
  const endpoint = ENV.VITE_ORDER_ENDPOINT;
  if (endpoint) {
    try {
      await postJson(endpoint, { ...body, channel: "endpoint", logoFile: logoFile || null });
      attempts.push({ channel: "endpoint", ok: true });
      saveLocal({ ...body, channel: "endpoint" }, "endpoint");
      clearRevision();
      return { ok: true, channel: "endpoint", ref, message: sentMessage(body.contact?.email), attempts };
    } catch (e) {
      const status = e?.status ? ` (error ${e.status})` : e?.name === "AbortError" ? " in time" : "";
      attempts.push({ channel: "endpoint", ok: false, error: String(e?.message || e) });
      reasons.push(`we couldn't reach the order inbox${status}`);
    }
  }

  // (c) this device
  const reason = reasons.length ? reasons.join("; ") : null;
  const saved = saveLocal({ ...body, channel: "local" }, "local", { reason });
  attempts.push({ channel: "local", ok: saved.ok, reason: saved.ok ? undefined : saved.reason });
  if (saved.ok) clearRevision();
  const why = reasons.length
    ? `${capitalize(reasons[0])}, so`
    : "This preview isn't connected to an order inbox yet, so";
  if (saved.ok) {
    return {
      ok: true,
      channel: "local",
      ref,
      stored: true,
      fallbackReason: reason,
      message: `${why} your order was saved on this device. Download the design pack and email it to ${CONTACT_EMAIL}.`,
      attempts,
    };
  }
  return {
    ok: false,
    channel: "local",
    ref,
    stored: false,
    fallbackReason: reason,
    message: `${why.replace(/, so$/, "")}, and this browser won't let us save it either. Download the design pack now and email it to ${CONTACT_EMAIL}.`,
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

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const txt = (v) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** inboxOrder(raw, from) → an order body with the shapes the inbox renders (data is untrusted). */
function inboxOrder(raw, from) {
  const o = { ...raw };
  o.ref = txt(raw.ref);
  o.id = `${from}/${o.ref}`; // unique per coach document (a ref string is coach-chosen)
  o.from = from;
  o.createdAt = typeof raw.createdAt === "string" && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : "";
  o.team = isObj(raw.team) ? { school: txt(raw.team.school), mascot: txt(raw.team.mascot), isSample: !!raw.team.isSample } : { school: "", mascot: "" };
  o.contact = isObj(raw.contact) ? Object.fromEntries(["coach", "email", "phone", "school", "address", "needBy", "notes"].map((k) => [k, txt(raw.contact[k])])) : {};
  o.garments = arr(raw.garments).filter(isObj).map((g) => ({ ...g, id: txt(g.id), name: txt(g.name) || txt(g.id), front: arr(g.front).map(txt), back: arr(g.back).map(txt), colors: isObj(g.colors) ? g.colors : {} }));
  o.roster = arr(raw.roster).filter(isObj);
  o.extras = isObj(raw.extras) ? raw.extras : {};
  o.quantities = isObj(raw.quantities) ? raw.quantities : {};
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
  o.totals = isObj(raw.totals) ? { ...raw.totals, units: num(raw.totals.units), total: num(raw.totals.total), lines: arr(raw.totals.lines).filter(isObj) } : null;
  o.effect = isObj(raw.effect) ? { ...raw.effect, name: txt(raw.effect.name), method: txt(raw.effect.method), settings: arr(raw.effect.settings).filter(isObj) } : { name: "", method: "", settings: [] };
  o.design = isObj(raw.design) ? { dropStyleName: txt(raw.design.dropStyleName) } : {};
  o.logo = isObj(raw.logo)
    ? { name: txt(raw.logo.name), isSample: !!raw.logo.isSample, thumb: /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(txt(raw.logo.thumb)) ? raw.logo.thumb : null, file: isObj(raw.logo.file) && typeof raw.logo.file.path === "string" ? { path: raw.logo.file.path, width: Number(raw.logo.file.width) || null, height: Number(raw.logo.file.height) || null } : null }
    : { name: "" };
  o.palette = isObj(raw.palette) ? raw.palette : {};
  o.replaces = txt(raw.replaces) || null;
  // the status is the owner's call ("orders/_status"); a coach's document can't set it
  o.status = "requested";
  return o;
}

/**
 * watchOrders(db, onOrders, onError) → unsubscribe. ONE subscription to the "orders"
 * collection; every viewer document's `orders` array is flattened, statuses from
 * "orders/_status" applied, newest first. onOrders(orders, { statuses }).
 */
export function watchOrders(db, onOrders, onError) {
  try {
    return db.collection(ORDERS_COLLECTION).onSnapshot(
      (snap) => {
        let statuses = null;
        const byRef = new Map();
        for (const d of snap?.docs || []) {
          const data = typeof d.data === "function" ? d.data() : null;
          if (!isObj(data)) continue;
          if (d.id === STATUS_DOC_ID) { statuses = isObj(data.statuses) ? data.statuses : {}; continue; }
          for (const raw of arr(data.orders)) {
            if (!isObj(raw) || !txt(raw.ref)) continue;
            const o = inboxOrder(raw, d.id);
            const seen = byRef.get(o.id);
            if (!seen || String(o.createdAt) > String(seen.createdAt)) byRef.set(o.id, o);
          }
        }
        const orders = [...byRef.values()].sort(byNewest);
        // refs are coach-written strings ("__proto__", "constructor"…): Map + own-property
        // lookups only, so a ref can never resolve to an Object.prototype member
        // (a revision only replaces an order in the SAME coach's document)
        const replacedBy = new Map();
        for (const o of orders) if (o.replaces && byRef.has(`${o.from}/${o.replaces}`)) replacedBy.set(`${o.from}/${o.replaces}`, o.ref);
        for (const o of orders) {
          const st = statuses && Object.prototype.hasOwnProperty.call(statuses, o.ref) ? statuses[o.ref] : null;
          if (isObj(st) && ORDER_STATUSES.some((x) => x.id === st.status)) { o.status = st.status; o.statusAt = txt(st.at); }
          if (replacedBy.has(o.id)) o.replacedBy = replacedBy.get(o.id);
        }
        onOrders(orders, { statuses: statuses || {}, hasStatusDoc: statuses !== null });
      },
      (e) => onError?.(e),
    );
  } catch (e) {
    onError?.(e);
    return () => {};
  }
}

/**
 * setOrderStatus(db, ref, status, { hasStatusDoc, statuses }) → Promise<void> (rejects with
 * the db error). Writes only the owner's "orders/_status" document.
 */
export async function setOrderStatus(db, ref, status, { hasStatusDoc = false, statuses = {} } = {}) {
  const docRef = db.doc(`${ORDERS_COLLECTION}/${STATUS_DOC_ID}`);
  const entry = { status, at: new Date().toISOString() };
  if (hasStatusDoc) {
    try {
      await retryOnce(() => docRef.update({ statuses: { [ref]: entry } }));
      return;
    } catch (e) {
      if (e?.code !== "invalid_argument") throw e; // gone since the snapshot: recreate below
    }
  }
  await retryOnce(() => docRef.set({ statuses: { ...(isObj(statuses) ? statuses : {}), [ref]: entry } }));
}

/**
 * likelyChannel() → Promise<"artifact-db" | "endpoint" | "local">: where submitOrder will
 * most likely put the order, so the UI can label the button honestly before sending.
 * (A db write can still be refused; submitOrder reports what actually happened.)
 */
export async function likelyChannel() {
  try {
    const [db, user] = await Promise.all([getCapability("db"), getCapability("user")]);
    if (db && typeof db.doc === "function" && (await viewerId())) {
      let canWrite = null;
      try { canWrite = typeof user?.can === "function" ? await user.can("data.write") : null; } catch { canWrite = null; }
      if (canWrite !== false) return "artifact-db";
    }
  } catch { /* fall through */ }
  return ENV.VITE_ORDER_ENDPOINT ? "endpoint" : "local";
}
