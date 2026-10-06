// Mascot Lab — end-to-end flow test of a SHIPPED build, in Chromium. Builds nothing.
//
//   node scripts/e2e.mjs                    static build: serves dist/ (tiny static server)
//   node scripts/e2e.mjs --dist=/tmp/x      … another outDir
//   node scripts/e2e.mjs --artifact         single-file Artifact page (dist-artifact/mascot-lab.html)
//                                           inside a host-like harness: doctype/head/body skeleton,
//                                           strict CSP, a mock window.claude (downloads, db, user)
//   options: --file=<page.html> (artifact)  --viewports=desktop,phone[,signedout]  --shots=.shots/e2e
//            --no-downloads (skip line sheet / design pack)  --json=<out.json>
//            --worker-src="<sources>" (artifact: override the CSP's worker-src, e.g. 'none',
//            to see the main-thread fallback)  --no-storage (localStorage throws, as in a
//            frame with blocked site data)
//
// The flow (each viewport, a fresh browser context = empty storage):
//   #home hero renders → "Try it with the Bulldogs" → #studio gallery fills (≥ 20 tiles with
//   pixels, no error tiles) → upload bulldog-on-white.jpg → background removed (transparent
//   corners) → pick another effect, change a param → "Use this look" → #collection: all six
//   garments render → switch drop style → line sheet PNG → "Order this collection" → #order:
//   clear the examples, paste a 13-player roster → review → contact form → send → #done: a ref
//   and the truthful message for the channel that was really used → design pack zip.
// Every step: zero console errors / page errors / CSP violations, no request leaves the
// page's own server (artifact: no request at all besides the page), no horizontal scroll
// at 390 px. Artifact mode adds: worker ran under the CSP?, files went through the
// downloads capability, the order went to the db mock under the declared rules
// (orders/<uid>; a view-only viewer is refused and the page says so), the owner inbox
// lists it, sample SVGs decode. Exit code 1 on any failure.
// Artifact viewers: desktop = a Contributor coach (order → db orders/<uid>); phone = a
// view-only member (the rules refuse the write → saved on the device, and the page says
// why); signedout = every use() resolves null; then the owner opens #orders.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import JSZip from "jszip";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};
const ARTIFACT = !!flag("artifact", false);
const ENV = ARTIFACT ? "artifact" : "static";
const DIST = path.resolve(ROOT, String(flag("dist", "dist")));
const PAGE_FILE = path.resolve(ROOT, String(flag("file", "dist-artifact/mascot-lab.html")));
const VIEWPORTS = String(flag("viewports", ARTIFACT ? "desktop,phone,signedout" : "desktop,phone")).split(",").filter(Boolean);
const SHOTS = path.resolve(ROOT, String(flag("shots", ".shots/e2e")));
const DOWNLOADS = !flag("no-downloads", false);
const JSON_OUT = flag("json", null);
const FIXTURE = path.join(ROOT, "src/assets/samples/bulldog-on-white.jpg");
const WORKER_SRC = flag("worker-src", null);
const NO_STORAGE = !!flag("no-storage", false);

// What the Artifact frame allows (approximation; see the report for what is assumed).
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob: https://cdnjs.cloudflare.com",
  `worker-src ${typeof WORKER_SRC === "string" ? WORKER_SRC : "blob: 'self'"}`,
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src data: https://fonts.gstatic.com",
  "img-src data: blob:",
  "connect-src 'none'",
].join("; ");
// The db rules the page is published with (orderService.js header).
const DB_RULES = [
  { path: "orders", read: "owner", write: "owner" },
  { path: "orders/{self}", write: "interact" },
];

const ROSTER = `Jamal Carter, 23, L
Kai Brooks, 5, M, S
Devin Okafor, 00, 2XL, XL
Marcus Hill, 1, S
Tyrese Grant, 3, M
Owen Park, 10, L
Eli Navarro, 11, XL
Sam Whitfield, 12, M
Andre Lewis, 14, L
Noah Bishop, 21, XL
Caleb Ruiz, 24, S
Isaiah Moore, 32, 2XL
Luke Jensen, 44, L`;
const CONTACT = {
  coach: "Coach Jordan Ellis",
  email: "coach@northgate.example",
  phone: "(555) 201-4417",
  school: "Northgate High School",
  address: "Athletics Office\n1200 Gate Rd\nNorthgate, OH 43001",
};

/* ───────────────────────────── small utils ───────────────────────────── */

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  const direct = path.join(base, "chromium");
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  try {
    for (const d of fs.readdirSync(base)) {
      if (d.startsWith("chromium-") && !d.includes("headless")) {
        for (const p of [path.join(base, d, "chrome-linux", "chrome"), path.join(base, d, "chrome-linux64", "chrome")]) {
          if (fs.existsSync(p)) return p;
        }
      }
    }
  } catch { /* fall through */ }
  return undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const dirSize = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? dirSize(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
class StepError extends Error {}
const assert = (cond, msg) => { if (!cond) throw new StepError(msg); };

/** poll(fn, until, { timeout, interval }) → last value; throws on timeout with `what`. */
async function pollBase(fn, until, { timeout = 60000, interval = 250, what = "condition", bail = null } = {}) {
  const t0 = Date.now();
  let v;
  for (;;) {
    v = await fn();
    if (until(v)) return v;
    const why = bail && bail();
    if (why) throw new StepError(`gave up waiting for ${what}: ${why}`);
    if (Date.now() - t0 > timeout) throw new StepError(`timed out after ${Math.round(timeout / 1000)} s waiting for ${what} (last: ${JSON.stringify(v)?.slice(0, 300)})`);
    await sleep(interval);
  }
}

/* ───────────────────────────── servers ───────────────────────────── */

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".woff": "font/woff", ".woff2": "font/woff2", ".json": "application/json", ".ico": "image/x-icon", ".txt": "text/plain",
};

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

/** Static: dist/ as files. */
function staticServer(root) {
  const hits = [];
  return listen((req, res) => {
    const u = new URL(req.url, "http://x");
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(root, p);
    hits.push(p);
    if (!f.startsWith(root) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(f).pipe(res);
  }).then((s) => ({ ...s, hits }));
}

/** Artifact: the page content inside the host's skeleton, under the frame's CSP; nothing else. */
function artifactServer(file) {
  const content = fs.readFileSync(file, "utf8");
  const html = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0}</style></head><body>${content}</body></html>`;
  const hits = [];
  return listen((req, res) => {
    const u = new URL(req.url, "http://x");
    hits.push(u.pathname);
    if (u.pathname !== "/") {
      res.writeHead(404, { "content-type": "text/plain", "content-security-policy": CSP });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, "cache-control": "no-store" });
    res.end(html);
  }).then((s) => ({ ...s, hits, bytes: Buffer.byteLength(html) }));
}

/* ───────────────────────────── db mock (Node side, shared by every context) ───────────────────────────── */

const RANK = { view: 0, interact: 1, admin: 2, owner: 3 };
class MockDb {
  constructor(rules) {
    this.rules = [...rules].sort((a, b) => a.path.split("/").length - b.path.split("/").length);
    this.docs = new Map();
    this.log = [];
    this.stamp = 0;
  }
  access(p, v) {
    const segs = p.split("/");
    let read = "view", write = "interact"; // root defaults
    for (const r of this.rules) {
      const rs = r.path ? r.path.split("/") : [];
      if (rs.length > segs.length) continue;
      if (!rs.every((s, i) => (s === "{self}" ? segs[i] === v.uid : s === segs[i]))) continue;
      if (r.read) read = r.read;
      if (r.write) write = r.write;
    }
    // {self} subtrees are private to their viewer unless a rule at the prefix opens them
    for (const r of this.rules) {
      if (!r.path.endsWith("/{self}")) continue;
      const pre = r.path.slice(0, -7).split("/");
      if (segs.length > pre.length && pre.every((s, i) => segs[i] === s) && segs[pre.length] !== v.uid) {
        if (!this.rules.some((x) => x.path === pre.join("/"))) return { read: false, write: false };
      }
    }
    const lvl = RANK[v.level] ?? -1;
    const w = lvl >= RANK[write];
    return { read: w || lvl >= RANK[read], write: w }; // writing implies reading
  }
  handle(v, op, a = {}) {
    const p = String(a.path || "");
    const entry = { uid: v.uid, op, path: p, ok: true };
    this.log.push(entry);
    const fail = (code, message) => { entry.ok = false; entry.code = code; return { error: { code, message } }; };
    const body = (d) => {
      if (!d || typeof d !== "object" || Array.isArray(d)) return "body must be a plain object";
      if (Buffer.byteLength(JSON.stringify(d)) > 256 * 1024) return "document over 256 KiB";
      return null;
    };
    const acc = this.access(p, v);
    switch (op) {
      case "get":
        return { ok: acc.read && this.docs.has(p) ? { exists: true, data: this.docs.get(p) } : { exists: false } };
      case "set": {
        if (!acc.write) return fail("invalid_argument", `write to ${p} refused by the rules`);
        const bad = body(a.data);
        if (bad) return fail("invalid_argument", bad);
        this.docs.set(p, JSON.parse(JSON.stringify(a.data)));
        this.stamp++;
        return { ok: true };
      }
      case "update": {
        if (!acc.write) return fail("invalid_argument", `write to ${p} refused by the rules`);
        if (!this.docs.has(p)) return fail("invalid_argument", `update of missing ${p}`);
        const merge = (t, s) => { for (const [k, x] of Object.entries(s)) t[k] = x && typeof x === "object" && !Array.isArray(x) && t[k] && typeof t[k] === "object" && !Array.isArray(t[k]) ? merge({ ...t[k] }, x) : x; return t; };
        const next = merge(JSON.parse(JSON.stringify(this.docs.get(p))), a.data || {});
        const bad = body(next);
        if (bad) return fail("invalid_argument", bad);
        this.docs.set(p, next);
        this.stamp++;
        return { ok: true };
      }
      case "delete":
        if (!acc.write) return fail("invalid_argument", `delete of ${p} refused by the rules`);
        this.docs.delete(p);
        this.stamp++;
        return { ok: true };
      case "query": {
        const docs = [...this.docs.keys()]
          .filter((k) => k.startsWith(p + "/") && !k.slice(p.length + 1).includes("/") && this.access(k, v).read)
          .sort()
          .map((k) => ({ id: k.slice(p.length + 1), data: this.docs.get(k) }));
        return { ok: { docs, stamp: this.stamp } };
      }
      default:
        return fail("invalid_argument", `unknown op ${op}`);
    }
  }
}

/* ───────────────────────────── in-page init scripts ───────────────────────────── */

/** Runs in the page before any of its scripts: CSP violation log. */
function probeInit() {
  window.__e2eCsp = [];
  document.addEventListener("securitypolicyviolation", (e) => {
    window.__e2eCsp.push({ directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber });
  });
}

/** --no-storage: every Web Storage accessor throws, like a frame with blocked site data. */
function noStorage() {
  for (const k of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(window, k, { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
  }
}

/** Runs in the page before any of its scripts: a window.claude shaped like the runtime contract. */
function claudeMock(cfg) {
  const log = (window.__e2e = { uses: [], downloads: [], files: {} });
  const later = (v, ms = 30) => new Promise((r) => setTimeout(() => r(v), ms));
  const err = (code, message) => Object.assign(new Error(message), { code });
  const ALLOWED = new Set("gif png jpg jpeg webp mp4 webm txt json md docx pptx epub csv ttf html svg pdf xlsx zip".split(" "));
  let prompting = false;

  const downloads = Object.freeze({
    async save(req) {
      if (!req || typeof req.filename !== "string" || !req.filename || req.filename.length > 512) throw err("bad_request", "bad filename");
      const ext = (req.filename.match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase();
      if (!ext || !ALLOWED.has(ext)) throw err("rejected_extension", `.${ext} is not allowed`);
      if (prompting) throw err("rate_limited", "a prompt is already open");
      const d = req.data;
      let bytes;
      if (typeof d === "string") bytes = new TextEncoder().encode(d);
      else if (d instanceof Blob) bytes = new Uint8Array(await d.arrayBuffer());
      else if (d instanceof ArrayBuffer) bytes = new Uint8Array(d.slice(0));
      else if (ArrayBuffer.isView(d)) bytes = new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
      else throw err("bad_request", "bad data");
      if (!bytes.length) throw err("bad_request", "empty data");
      prompting = true;
      await later(null, 40); // the viewer confirms
      prompting = false;
      log.downloads.push({ filename: req.filename, size: bytes.length, kind: d instanceof Blob ? "Blob" : typeof d, magic: [...bytes.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("") });
      log.files[req.filename] = bytes;
      return { status: "saved" };
    },
  });

  const user = Object.freeze({
    isOwner: async () => !!cfg.isOwner,
    canEdit: async () => !!cfg.isOwner,
    can: async (name) => (name === "data.write" ? cfg.canWrite : false),
    id: async () => cfg.uid,
    me: async () => ({ id: cfg.uid, name: "", avatarUrl: "data:,", color: "#7D838C", email: null, isOwner: !!cfg.isOwner, canEdit: !!cfg.isOwner }),
    profiles: async (ids) => Object.fromEntries((ids || []).map((id) => [id, { id, name: "", avatarUrl: "data:,", color: "#7D838C", isMe: id === cfg.uid }])),
  });

  // db: refs build synchronously (grammar errors throw TypeError); calls go to the Node store
  const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
  const checkPath = (p, kind) => {
    const segs = String(p).split("/");
    if (!segs.every((s) => SEG.test(s) && s !== "." && s !== "..")) throw new TypeError(`bad path segment in "${p}"`);
    if (kind === "doc" && segs.length % 2) throw new TypeError(`"${p}" has ${segs.length} segments: not a document path`);
    if (kind === "col" && !(segs.length % 2)) throw new TypeError(`"${p}" has ${segs.length} segments: not a collection path`);
  };
  const call = async (op, a) => {
    const r = await window.__e2eDb(op, a);
    if (r && r.error) throw err(r.error.code, r.error.message);
    return r ? r.ok : undefined;
  };
  const meta = Object.freeze({ fromCache: false, hasPendingWrites: false });
  const docSnap = (id, r) => Object.freeze({ id, exists: !!r.exists, data: () => (r.exists ? JSON.parse(JSON.stringify(r.data)) : undefined), metadata: meta });
  const querySnap = (docs) => {
    const list = docs.map((d) => docSnap(d.id, { exists: true, data: d.data }));
    return Object.freeze({ docs: list, size: list.length, empty: !list.length, docChanges: () => list.map((doc, i) => ({ type: "added", doc, oldIndex: -1, newIndex: i })), metadata: meta });
  };
  const plain = (data) => JSON.parse(JSON.stringify(data));
  function docRef(p) {
    checkPath(p, "doc");
    const id = p.split("/").pop();
    return Object.freeze({
      id,
      path: p,
      get: () => call("get", { path: p }).then((r) => docSnap(id, r)),
      set: (data) => call("set", { path: p, data: plain(data) }).then(() => undefined),
      update: (data) => call("update", { path: p, data: plain(data) }).then(() => undefined),
      delete: () => call("delete", { path: p }).then(() => undefined),
      acquire: async () => ({ acquired: true, version: 1, expiresAt: new Date(Date.now() + 30000).toISOString() }),
      onSnapshot(next, error) {
        let last = null, dead = false;
        const tick = () => call("get", { path: p }).then((r) => {
          const sig = JSON.stringify(r);
          if (!dead && sig !== last) { last = sig; next(docSnap(id, r)); }
        }, (e) => { if (!dead) { dead = true; clearInterval(t); error?.(e); } });
        const t = setInterval(tick, 400);
        setTimeout(tick, 10);
        return () => { dead = true; clearInterval(t); };
      },
      collection: (sub) => colRef(`${p}/${sub}`),
    });
  }
  function colRef(p) {
    checkPath(p, "col");
    const q = {
      path: p,
      where: () => q, orderBy: () => q, limit: () => q, // the app doesn't filter; kept chainable
      get: () => call("query", { path: p }).then((r) => querySnap(r.docs)),
      onSnapshot(next, error) {
        let last = -1, dead = false;
        const tick = () => call("query", { path: p }).then((r) => {
          if (!dead && r.stamp !== last) { last = r.stamp; next(querySnap(r.docs)); }
        }, (e) => { if (!dead) { dead = true; clearInterval(t); error?.(e); } });
        const t = setInterval(tick, 400);
        setTimeout(tick, 10);
        return () => { dead = true; clearInterval(t); };
      },
      doc: (id) => docRef(`${p}/${id ?? Math.random().toString(36).slice(2, 12)}`),
      add: async (data) => { const r = docRef(`${p}/${Math.random().toString(36).slice(2, 12)}`); await r.set(data); return r; },
    };
    return Object.freeze(q);
  }
  const db = Object.freeze({ doc: docRef, collection: colRef });

  const NS = { downloads, user, db };
  const memo = new Map();
  const claude = Object.freeze({
    use(name) {
      log.uses.push(name);
      if (memo.has(name)) return memo.get(name);
      const p = later(cfg.caps.includes(name) && NS[name] ? NS[name] : null);
      memo.set(name, p);
      return p;
    },
  });
  Object.defineProperty(window, "claude", { value: claude, configurable: false, enumerable: true, writable: false });
}

/* ───────────────────────────── page probes (run in the page) ───────────────────────────── */

/** Pixels with alpha > 8 in a canvas (sampled), 0 for none / not drawn. */
const INK_FN = `(c) => {
  if (!c || !c.width || !c.height) return 0;
  const g = c.getContext("2d"); if (!g) return 0;
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const step = Math.max(1, Math.floor(Math.sqrt(c.width * c.height / 30000)));
  let n = 0;
  for (let y = 0; y < c.height; y += step) for (let x = 0; x < c.width; x += step) if (d[(y * c.width + x) * 4 + 3] > 8) n++;
  return n;
}`;
/** A cheap pixel fingerprint of a canvas (changes when its content does). */
const PRINT_FN = `(c) => {
  if (!c || !c.width || !c.height) return "none";
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let h = 2166136261; const step = 4 * Math.max(1, Math.floor(c.width * c.height / 4000));
  for (let i = 0; i < d.length; i += step) { h ^= d[i] + 3 * d[i + 1] + 7 * d[i + 2] + 11 * d[i + 3]; h = Math.imul(h, 16777619); }
  return c.width + "x" + c.height + ":" + (h >>> 0).toString(36);
}`;

/* ───────────────────────────── the flow ───────────────────────────── */

const results = [];
const facts = {}; // timings, sizes, worker info … for the report

async function runFlow(browser, origin, vp, scenario, db) {
  const phone = vp === "phone";
  const tag = `${ENV}/${phone ? "phone" : "desktop"}${scenario.label ? `/${scenario.label}` : ""}`;
  const downloads = DOWNLOADS && !phone && !scenario.noDownloads;
  const context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    acceptDownloads: true,
    colorScheme: "light",
  });
  await context.addInitScript(probeInit);
  if (NO_STORAGE) await context.addInitScript(noStorage);
  if (scenario.claude) {
    await context.addInitScript(claudeMock, scenario.claude);
    await context.exposeBinding("__e2eDb", (_src, op, a) => db.handle({ uid: scenario.claude.uid, level: scenario.claude.level }, op, a));
  }
  // network: the page may only talk to its own server (artifact: only the page itself)
  const offsite = [];
  await context.route("**/*", (route) => {
    const u = route.request().url();
    const own = u.startsWith(origin + "/");
    const allowed = ARTIFACT ? u === origin + "/" || u.startsWith(origin + "/#") : own;
    if (!allowed) { offsite.push(u.slice(0, 160)); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  const warnings = new Set();
  const infos = [];
  const workers = [];
  // --worker-src experiments: the browser's own "Refused to create a worker" report is expected
  const expected = (t) => WORKER_SRC != null && /Refused to create a worker|^\[csp\] worker-src/.test(t);
  page.on("console", (m) => {
    if (m.type() === "error" && !expected(m.text())) errors.push(`[console.error] ${m.text()}`);
    else if (m.type() === "warning") warnings.add(m.text().slice(0, 240));
    else if (m.type() === "info" && /\[render\]/.test(m.text())) infos.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  page.on("worker", (w) => {
    workers.push(w.url().slice(0, 60));
    w.on("console", (m) => { if (m.type() === "error") errors.push(`[worker console.error] ${m.text()}`); });
  });

  const flow = { aborted: false, n: 0, e0: 0 };
  // inside a step, stop waiting as soon as the page reports an error
  const poll = (fn, until, o = {}) => pollBase(fn, until, { ...o, bail: () => (errors.length > flow.e0 ? errors.slice(flow.e0, flow.e0 + 3).join(" | ") : null) });
  const S = {}; // flow state shared across steps
  const now = () => page.evaluate(() => performance.now());
  const state = () => page.evaluate(() => window.__mascotLab?.getState());
  const shot = async (name) => {
    try { await page.screenshot({ path: path.join(SHOTS, `${ENV}-${vp}${scenario.label ? `-${scenario.label}` : ""}-${String(flow.n).padStart(2, "0")}-${name}.png`) }); } catch { /* best effort */ }
  };
  /** first visible match of a locator (phones keep desktop-only twins in the DOM) */
  const visible = async (loc, what) => {
    const n = await loc.count();
    for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible()) return loc.nth(i);
    throw new StepError(`no visible ${what}`);
  };
  const clickVisible = async (loc, what) => (await visible(loc, what)).click();

  async function step(name, fn) {
    flow.n++;
    if (flow.aborted) { results.push({ env: ENV, vp: tag, step: name, status: "skip" }); return; }
    const e0 = (flow.e0 = errors.length);
    const o0 = offsite.length;
    const t0 = Date.now();
    let note = "";
    let status = "pass";
    try {
      note = (await fn()) || "";
      await sleep(150);
      const csp = await page.evaluate(() => (window.__e2eCsp || []).splice(0)).catch(() => []);
      for (const c of csp) { const t = `[csp] ${c.directive} blocked ${c.blocked || "(inline)"} ${c.source ? `@${c.source}:${c.line}` : ""}`; if (!expected(t)) errors.push(t); else warnings.add(t); }
      if (errors.length > e0) throw new StepError(`console/page errors:\n      ${errors.slice(e0, e0 + 6).join("\n      ")}`);
      if (offsite.length > o0) throw new StepError(`network requests left the page: ${offsite.slice(o0, o0 + 5).join(", ")}`);
      if (phone) {
        const h = await page.evaluate(() => {
          const over = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
          if (over <= 1) return null;
          const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
            .slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} → ${Math.round(el.getBoundingClientRect().right)}`);
          return { over, wide };
        });
        if (h) throw new StepError(`horizontal scroll at 390 px: ${h.over}px too wide (${h.wide.join("; ")})`);
      }
    } catch (e) {
      status = "FAIL";
      note = e instanceof StepError ? e.message : `${e.message.split("\n")[0]}`;
      flow.aborted = true;
    }
    await shot(name.replace(/[^a-z0-9]+/gi, "-").toLowerCase());
    results.push({ env: ENV, vp: tag, step: name, status, ms: Date.now() - t0, note });
    console.log(`  ${status === "pass" ? "ok  " : "FAIL"} ${tag.padEnd(26)} ${name.padEnd(34)} ${String(Date.now() - t0).padStart(6)} ms  ${note.split("\n")[0].slice(0, 150)}`);
    if (status !== "pass" && note.includes("\n")) console.log(`       ${note.split("\n").slice(1).join("\n       ")}`);
  }
  const timing = (k, v) => { (facts[tag] ||= {})[k] = v; };

  /* 1 ── #home */
  await step("home: hero renders", async () => {
    await page.goto(`${origin}/#home`, { waitUntil: "load", timeout: 60000 });
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
    const r = await poll(
      () => page.evaluate(`(() => { const ink = ${INK_FN}; const cs = [...document.querySelectorAll(".lp-hero__art canvas")]; return { n: cs.length, inked: cs.filter((c) => ink(c) > 50).length, t: performance.now() }; })()`),
      (v) => v.inked >= 1,
      { timeout: 60000, interval: 100, what: "a painted hero canvas" },
    );
    timing("heroFirstCanvasMs", Math.round(r.t));
    // the hero's look gets pulled onto a garment too: wait for a second painted canvas
    const r2 = await poll(
      () => page.evaluate(`(() => { const ink = ${INK_FN}; return { inked: [...document.querySelectorAll(".lp-hero__art canvas")].filter((c) => ink(c) > 50).length, t: performance.now() }; })()`),
      (v) => v.inked >= 2, { timeout: 60000, interval: 150, what: "hero art + garment" },
    ).catch(() => null);
    if (r2) timing("heroArtAndGarmentMs", Math.round(r2.t));
    const st = await state();
    assert(st?.team?.isSample, "the app should open on the sample team");
    return `first hero canvas at ${Math.round(r.t)} ms after navigation${r2 ? `, ${r2.inked} painted by ${Math.round(r2.t)} ms` : ""}`;
  });

  if (!phone) {
    // every weight the CSS and the canvases use is really there (latin + latin-ext for the
    // display/body faces), and nothing else ships (no vietnamese/cyrillic subsets)
    await step("fonts: every face the UI uses", async () => {
      const r = await page.evaluate(async () => {
        const fam = (f) => f.family.replace(/["']/g, "");
        const want = [["Big Shoulders Display", [700, 800, 900], true], ["Archivo", [400, 500, 600, 700], true], ["IBM Plex Mono", [500, 600], false], ["Graduate", [400], false]];
        const missing = [];
        for (const [family, weights, ext] of want) {
          for (const w of weights) {
            for (const text of ext ? ["AZaz09", "ŁŐŞŽ"] : ["AZaz09"]) {
              const faces = await document.fonts.load(`${w} 16px "${family}"`, text);
              if (!faces.some((f) => fam(f) === family && String(f.weight) === String(w))) missing.push(`${family} ${w} "${text}"`);
            }
          }
        }
        // one face per subset: latin (+ latin-ext for display/body). The default @fontsource
        // imports add vietnamese (+ cyrillic, cyrillic-ext for Plex Mono) faces per weight.
        // (Chromium reports CSS faces' unicodeRange as U+0-10FFFF, so faces are counted.)
        const all = [...document.fonts];
        const perFace = {};
        for (const f of all) perFace[`${fam(f)} ${f.weight}`] = (perFace[`${fam(f)} ${f.weight}`] || 0) + 1;
        const limit = (k) => (/^(Archivo|Big Shoulders Display) /.test(k) ? 2 : 1);
        const exotic = Object.entries(perFace).filter(([k, n]) => n > limit(k)).map(([k, n]) => `${k} ×${n}`);
        return { missing, exotic, faces: all.length };
      });
      assert(!r.missing.length, `missing faces: ${r.missing.join(", ")}`);
      assert(!r.exotic.length, `more subsets than latin/latin-ext shipped: ${r.exotic.slice(0, 4).join("; ")}`);
      return `${r.faces} @font-face rules; every used weight loads (latin + latin-ext display/body)`;
    });
  }

  /* 2 ── #studio gallery */
  await step("studio: gallery fills", async () => {
    const t0 = await now();
    await clickVisible(page.getByRole("button", { name: /Try it with the Bulldogs/ }), '"Try it with the Bulldogs" button');
    await page.waitForFunction(() => location.hash === "#studio", null, { timeout: 10000 });
    const marks = {};
    const r = await poll(
      () => page.evaluate(`(() => { const ink = ${INK_FN}; const tiles = [...document.querySelectorAll(".st-tile:not(.is-ghost)")];
        return { total: tiles.length, rendered: tiles.filter((t) => ink(t.querySelector(".st-tile__art canvas")) > 30).length,
                 failed: tiles.filter((t) => t.classList.contains("is-failed")).map((t) => t.dataset.effect), t: performance.now() }; })()`),
      (v) => {
        if (v.rendered >= 1 && !marks.first) marks.first = v.t;
        if (v.rendered >= 20 && !marks.twenty) marks.twenty = v.t;
        return v.failed.length > 0 || (v.total >= 20 && v.rendered === v.total);
      },
      { timeout: 150000, interval: 250, what: "every gallery tile to render" },
    ).catch((e) => { throw e; });
    assert(!r.failed.length, `error tiles: ${r.failed.join(", ")}`);
    assert(r.rendered >= 20, `only ${r.rendered}/${r.total} tiles rendered`);
    timing("galleryFirstTileMs", Math.round(marks.first - t0));
    timing("gallery20TilesMs", Math.round(marks.twenty - t0));
    timing("galleryAllTilesMs", Math.round(r.t - t0));
    timing("galleryTiles", r.total);
    const rs = await page.evaluate(() => ({ stats: { ...window.__mascotRender?.stats }, pool: window.__mascotRender?.pool, mainOnly: window.__mascotRender?.mainThreadEffects }));
    timing("renderStatsAfterGallery", rs);
    S.originalPrint = await page.evaluate(`(${PRINT_FN})(document.querySelector('.st-tile[data-effect="original"] .st-tile__art canvas'))`);
    return `${r.rendered}/${r.total} tiles: first ${Math.round(marks.first - t0)} ms, 20 by ${Math.round(marks.twenty - t0)} ms, all ${Math.round(r.t - t0)} ms · worker jobs ${rs.stats.worker ?? "?"}, main ${rs.stats.main ?? "?"}, fallback ${rs.stats.fallback ?? "?"} (pool ${rs.pool?.state})`;
  });

  if (ARTIFACT) {
    await step("artifact: sample logos decode", async () => {
      const r = await page.evaluate(() => [...document.querySelectorAll(".st-sample__img img")].map((i) => ({ src: i.src.slice(0, 22), ok: i.complete && i.naturalWidth > 0 })));
      assert(r.length === 3, `expected 3 sample thumbnails, found ${r.length}`);
      assert(r.every((x) => x.ok), `sample thumbnails that didn't decode: ${JSON.stringify(r)}`);
      assert(r.every((x) => x.src.startsWith("data:image/svg+xml")), `sample URLs aren't data: SVG: ${r.map((x) => x.src).join(", ")}`);
      return `3 sample SVGs (data: URLs) decoded; bulldog rasterized for every tile (via blob: <img>)`;
    });
  }

  /* 3 ── upload the JPG fixture */
  await step("studio: upload JPG, bg removed", async () => {
    const before = await page.evaluate(`(${PRINT_FN})(document.querySelector('.st-tile[data-effect="original"] .st-tile__art canvas'))`);
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
    await page.getByText(/We removed the background from bulldog-on-white\.jpg/).first().waitFor({ timeout: 30000 });
    const st = await state();
    assert(st.logo.name === "bulldog-on-white.jpg" && !st.team.isSample, `logo not stored as the upload (name ${st.logo.name}, isSample ${st.team.isSample})`);
    // the logo preview canvas (desktop: logo card; phone: the collapsed panel's thumb)
    const sel = phone ? ".st-logo__thumb canvas" : ".st-logocard__preview canvas";
    const corners = await poll(
      () => page.evaluate(`(() => {
        const c = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.width > 0 && x.offsetParent !== null);
        if (!c) return { missing: true };
        const W = c.width, H = c.height, d = c.getContext("2d").getImageData(0, 0, W, H).data;
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) return { empty: true };
        const ins = Math.max(2, Math.round(Math.min(x1 - x0, y1 - y0) * 0.03));
        const a = (x, y) => d[(y * W + x) * 4 + 3];
        const pts = [[x0 + ins, y0 + ins], [x1 - ins, y0 + ins], [x0 + ins, y1 - ins], [x1 - ins, y1 - ins]].map(([x, y]) => a(x, y));
        return { box: [x0, y0, x1, y1], size: W, alpha: pts, print: (${PRINT_FN})(c) };
      })()`),
      (v) => v.alpha && v.alpha.every((x) => x <= 24), // ≤ 9 % (a 2× downscale leaks a little); an un-removed JPG is 255
      { timeout: 30000, interval: 300, what: "transparent corners on the logo preview" },
    );
    S.logoBox = corners.box;
    // the gallery re-renders with the new logo: wait until it has settled again, no errors
    const r = await poll(
      () => page.evaluate(`(() => { const ink = ${INK_FN}; const tiles = [...document.querySelectorAll(".st-tile")];
        return { total: tiles.length, rendered: tiles.filter((t) => ink(t.querySelector(".st-tile__art canvas")) > 30).length,
                 busy: document.querySelectorAll(".st-tile .ml-canvas.is-loading").length,
                 failed: tiles.filter((t) => t.classList.contains("is-failed")).map((t) => t.dataset.effect),
                 orig: (${PRINT_FN})(document.querySelector('.st-tile[data-effect="original"] .st-tile__art canvas')) }; })()`),
      (v) => v.failed.length > 0 || (v.busy === 0 && v.rendered === v.total && v.orig !== before),
      { timeout: 150000, interval: 300, what: "the gallery to re-render with the uploaded logo" },
    );
    assert(!r.failed.length, `error tiles after upload: ${r.failed.join(", ")}`);
    const pal = (await state()).palette;
    return `toast "We removed the background…"; preview corners alpha ${corners.alpha.join("/")} (bbox ${corners.box.join(",")} in ${corners.size}px); gallery ${r.rendered}/${r.total} re-rendered; palette ${pal.primary}/${pal.secondary}/${pal.accent}`;
  });

  /* 4 ── another effect + a param */
  await step("studio: pick effect, change param", async () => {
    const st0 = await state();
    const pick = st0.effect.id === "chrome" ? "neon" : "chrome";
    await page.locator(`.st-tile[data-effect="${pick}"] .st-tile__hit`).click();
    await page.waitForFunction((id) => window.__mascotLab.getState().effect.id === id, pick, { timeout: 10000 });
    const scope = phone ? page.locator('[role="dialog"]') : page.locator(".st-insp");
    if (phone) await scope.first().waitFor({ timeout: 10000 });
    const range = await visible(scope.locator(".st-params input[type=range]"), "param slider");
    const v0 = await range.inputValue();
    await range.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    const v1 = await range.inputValue();
    assert(v1 !== v0, `slider value didn't change (${v0})`);
    await page.waitForFunction(() => Object.keys(window.__mascotLab.getState().effect.params || {}).length > 0, null, { timeout: 5000 });
    // the big preview re-renders with the new value, without an error
    const r = await poll(
      () => page.evaluate(`(() => { const ink = ${INK_FN};
        const root = ${phone ? `document.querySelector('[role="dialog"]')` : `document.querySelector(".st-insp")`};
        const c = root && [...root.querySelectorAll(".st-insp__stagewrap canvas")].find((x) => x.width > 0);
        return { err: !!(root && root.querySelector(".st-insp__error")), ink: ink(c), busy: !!(root && root.querySelector(".st-insp__busy")) }; })()`),
      (v) => v.err || (v.ink > 30 && !v.busy),
      { timeout: 30000, interval: 250, what: "the inspector preview" },
    );
    assert(!r.err, "the inspector shows a render error");
    const st = await state();
    return `${pick}: ${JSON.stringify(st.effect.params)} (slider ${v0} → ${v1})`;
  });

  /* 5 ── use this look → #collection */
  await step("collection: six garments render", async () => {
    const t0 = await now();
    const scope = phone ? page.locator('[role="dialog"]') : page;
    await clickVisible(scope.getByRole("button", { name: /^Use this look/ }), '"Use this look" button');
    await page.waitForFunction(() => location.hash === "#collection", null, { timeout: 10000 });
    let first = 0;
    const r = await poll(
      () => page.evaluate(`(() => { const ink = ${INK_FN}; const cards = [...document.querySelectorAll(".cl-grid .cl-card:not(.cl-card--skeleton)")];
        return { cards: cards.length, names: cards.map((c) => c.getAttribute("aria-label")),
                 drawn: cards.filter((c) => ink(c.querySelector(".cl-card__media canvas")) > 200).length,
                 loading: document.querySelectorAll(".cl-card .ml-canvas.is-loading").length,
                 errors: document.querySelectorAll(".cl-card .ml-canvas__error").length,
                 lookError: !!document.querySelector(".cl-notices"), t: performance.now() }; })()`),
      (v) => { if (v.drawn >= 1 && !first) first = v.t; return v.errors > 0 || (v.cards === 6 && v.drawn === 6 && v.loading === 0); },
      { timeout: 150000, interval: 300, what: "six garment mockups" },
    );
    assert(r.errors === 0, `${r.errors} garment previews show "Preview unavailable"`);
    assert(!r.lookError, "the collection shows a logo/look error notice");
    timing("collectionFirstGarmentMs", Math.round(first - t0));
    timing("collectionAllSixMs", Math.round(r.t - t0));
    S.cardPrints = await page.evaluate(`[...document.querySelectorAll(".cl-grid .cl-card__media canvas")].map(${PRINT_FN})`);
    return `${r.cards} pieces (${r.names.join(", ")}): first ${Math.round(first - t0)} ms, all six ${Math.round(r.t - t0)} ms`;
  });

  await step("collection: switch drop style", async () => {
    const from = (await state()).collection.dropStyle;
    const to = from === "allover" ? "classic" : "allover";
    const label = to === "allover" ? /All-over/ : /Classic/;
    await page.getByRole("radio", { name: label }).click();
    await page.waitForFunction((id) => window.__mascotLab.getState().collection.dropStyle === id, to, { timeout: 5000 });
    const r = await poll(
      () => page.evaluate(`(() => { const ink = ${INK_FN}; const cs = [...document.querySelectorAll(".cl-grid .cl-card__media canvas")];
        return { prints: cs.map(${PRINT_FN}), drawn: cs.filter((c) => ink(c) > 200).length,
                 loading: document.querySelectorAll(".cl-card .ml-canvas.is-loading").length, errors: document.querySelectorAll(".cl-card .ml-canvas__error").length }; })()`),
      (v) => v.errors > 0 || (v.loading === 0 && v.drawn === 6 && v.prints.filter((p, i) => p !== S.cardPrints[i]).length >= 4),
      { timeout: 90000, interval: 300, what: "the cards to redraw in the new drop style" },
    );
    assert(r.errors === 0, "garment preview errors after switching style");
    return `${from} → ${to}; ${r.prints.filter((p, i) => p !== S.cardPrints[i]).length}/6 cards redrawn`;
  });

  if (downloads) {
    await step("collection: line sheet PNG", async () => {
      const t0 = Date.now();
      let file;
      if (ARTIFACT) {
        await clickVisible(page.getByRole("button", { name: /Download line sheet/ }), "line sheet button");
        const d = await poll(() => page.evaluate(() => window.__e2e.downloads.filter((x) => /\.png$/.test(x.filename))), (v) => v.length > 0, { timeout: 90000, what: "a downloads.save() of the line sheet" });
        const b64 = await page.evaluate((n) => { const b = window.__e2e.files[n]; let s = ""; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s); }, d[0].filename);
        file = { name: d[0].filename, buf: Buffer.from(b64, "base64"), how: "downloads capability" };
      } else {
        const [dl] = await Promise.all([
          page.waitForEvent("download", { timeout: 90000 }),
          clickVisible(page.getByRole("button", { name: /Download line sheet/ }), "line sheet button"),
        ]);
        const p = path.join(SHOTS, `${ENV}-${vp}-${dl.suggestedFilename()}`);
        await dl.saveAs(p);
        file = { name: dl.suggestedFilename(), buf: fs.readFileSync(p), how: "<a download>" };
      }
      const png = file.buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
      assert(png, `${file.name} is not a PNG`);
      const w = file.buf.readUInt32BE(16), h = file.buf.readUInt32BE(20);
      await page.getByText(/Line sheet (saved|download started)/).first().waitFor({ timeout: 10000 });
      timing("lineSheetMs", Date.now() - t0);
      fs.writeFileSync(path.join(SHOTS, `${ENV}-${vp}-${file.name}`), file.buf);
      return `${file.name} ${w}×${h} ${kb(file.buf.length)} via ${file.how} in ${Date.now() - t0} ms`;
    });
  }

  if (ARTIFACT && scenario.noDownloads && !phone && DOWNLOADS) {
    // no downloads capability inside the frame: <a download> would do nothing there, so the
    // page must say the file can't be saved (not "download started") and must not try it
    await step("collection: no downloads → says so", async () => {
      let anchors = 0;
      const onDl = () => anchors++;
      page.on("download", onDl);
      try {
        await clickVisible(page.getByRole("button", { name: /Download line sheet/ }), "line sheet button");
        const t = page.locator(".ml-toast").filter({ hasText: /Downloads aren't available in this view/ });
        await t.first().waitFor({ timeout: 90000 });
        await sleep(600);
        const claims = await page.locator(".ml-toast").filter({ hasText: /download started|Line sheet saved/i }).count();
        assert(claims === 0, "a toast claims the line sheet downloaded");
        assert(anchors === 0, "an <a download> fallback fired inside the frame");
        const saves = await page.evaluate(() => window.__e2e.downloads.length);
        assert(saves === 0, `downloads.save() called ${saves}× with no capability`);
        return `toast: "${(await t.first().innerText()).replace(/\s+/g, " ").slice(0, 120)}"`;
      } finally {
        page.off("download", onDl);
      }
    });
  }

  /* 6 ── #order */
  await step("order: clear examples + paste 13", async () => {
    await clickVisible(page.getByRole("button", { name: /^Order this collection/ }), '"Order this collection" button');
    await page.waitForFunction(() => location.hash === "#order", null, { timeout: 10000 });
    const ex0 = (await state()).roster.filter((r) => r.example).length;
    assert(ex0 > 0, "expected example players on a fresh order");
    await clickVisible(page.locator(".ord-example").getByRole("button", { name: "Clear examples" }), '"Clear examples" button');
    const dlg = page.locator('[role="dialog"], [role="alertdialog"]');
    await dlg.getByRole("button", { name: "Clear examples" }).click();
    await page.waitForFunction(() => window.__mascotLab.getState().roster.every((r) => !r.example), null, { timeout: 5000 });
    await clickVisible(page.getByRole("button", { name: "Paste roster" }), '"Paste roster" button');
    const ta = page.getByLabel("Roster text");
    await ta.waitFor({ timeout: 5000 });
    await ta.fill(ROSTER);
    await page.locator('[role="dialog"]').getByRole("button", { name: /(Replace with|Add) 13 players/ }).click();
    const rows = await poll(() => state().then((s) => s.roster.filter((r) => String(r.name || "").trim())), (v) => v.length === 13, { timeout: 5000, what: "13 roster rows" });
    assert(rows.every((r) => !r.example), "pasted rows are still marked as examples");
    const jersey23 = rows.find((r) => r.number === "23");
    assert(jersey23 && jersey23.top === "L", "Jamal Carter #23 L didn't parse");
    return `cleared ${ex0} examples; roster = 13 players (${rows.map((r) => r.number).join(" ")})`;
  });

  await step("order: review", async () => {
    const rv = await visible(page.getByRole("button", { name: /^Review order/ }), '"Review order" button');
    assert(await rv.isEnabled(), "Review order is disabled");
    await rv.click();
    await page.waitForFunction(() => location.hash === "#review", null, { timeout: 10000 });
    // toasts belong to their page: "Roster replaced: 13 players" leaves with #order
    await poll(() => page.locator(".ml-toast:not(.is-leaving)").filter({ hasText: /Roster replaced|Added 13 players/ }).count(), (n) => n === 0,
      { timeout: 2000, interval: 100, what: "the roster toast to close on the route change" });
    await page.locator('.rv-form input[name="coach"]').waitFor({ timeout: 15000 });
    const txt = await page.locator(".rv-send__total").innerText();
    return txt.replace(/\s+/g, " ");
  });

  await step("review: contact form + send", async () => {
    for (const [k, v] of Object.entries(CONTACT)) {
      const el = page.locator(`.rv-form [name="${k}"]`);
      await el.fill(v);
    }
    await page.locator('.rv-form input[name="rightsConfirmed"]').check();
    const send = await visible(page.getByRole("button", { name: /Send order request|Save order and get the pack/ }), "send button");
    const label = (await send.innerText()).trim();
    const expectLabel = scenario.channel === "artifact-db" ? /Send order request/i : /Save order and get the pack/i;
    assert(expectLabel.test(label), `send button says "${label}", expected ${expectLabel}`);
    await send.click();
    await page.waitForFunction(() => location.hash === "#done", null, { timeout: 30000 });
    return `clicked "${label}"`;
  });

  /* 7 ── #done */
  await step("done: ref + truthful message", async () => {
    await page.locator(".dn-ticket").waitFor({ timeout: 15000 });
    const st = await state();
    const ref = st.order.ref;
    assert(/^[A-Z0-9]{2,3}-[0-9A-Z]{5}$/.test(ref || ""), `bad order ref ${ref}`);
    assert(st.order.channel === scenario.channel, `order channel ${st.order.channel}, expected ${scenario.channel}`);
    const ticket = await page.locator(".dn-ticket").innerText();
    assert(ticket.includes(ref), "the ref isn't shown on the ticket");
    const hero = (await page.locator(".dn-hero").innerText()).replace(/\s+/g, " ");
    for (const want of scenario.doneText) assert(hero.toLowerCase().includes(want.toLowerCase()), `#done doesn't say "${want}" — it says: ${hero.slice(0, 300)}`);
    S.ref = ref;
    // the claim matches what really happened
    const local = NO_STORAGE ? [] : await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("mascot-lab:orders") || "[]"); } catch { return null; } });
    const mine = (local || []).find((x) => x.ref === ref);
    if (scenario.channel === "local") {
      assert(mine && mine.channel === "local", "the order isn't in this device's storage although #done says it was saved here");
    } else {
      const doc = db.docs.get(`orders/${scenario.claude.uid}`);
      assert(doc && Array.isArray(doc.orders) && doc.orders.some((o) => o.ref === ref), `orders/${scenario.claude.uid} doesn't hold ${ref}`);
      const o = doc.orders.find((x) => x.ref === ref);
      assert(o.roster?.length === 13 && o.contact?.email === CONTACT.email, "the stored order lacks the roster/contact");
      S.docBytes = Buffer.byteLength(JSON.stringify(doc));
      // the timeline must agree with the db about the uploaded logo travelling with the order
      const logoDocs = [...db.docs.keys()].filter((k) => k.startsWith(`orders/${scenario.claude.uid}/logos/`));
      const saysMissing = await page.getByText(/Your logo file didn't go with the request/).count();
      assert(logoDocs.length > 0 ? saysMissing === 0 : saysMissing > 0, `logo docs in db: ${logoDocs.length}, but #done ${saysMissing ? "says the logo didn't go with the request" : "doesn't ask for the logo"}`);
    }
    if (scenario.refusedWrite) {
      const refused = db.log.filter((x) => x.uid === scenario.claude.uid && x.op === "set" && !x.ok);
      assert(refused.length > 0 && !db.docs.has(`orders/${scenario.claude.uid}`), "a view-only viewer's write should have been refused by the rules");
    }
    const inboxShown = await page.locator(".ib-ref").count();
    assert(inboxShown === 0, "a coach (non-owner) sees the owner inbox");
    return `ref ${ref}; channel ${st.order.channel}; "${hero.slice(0, 140)}…"${S.docBytes ? ` · db doc ${kb(S.docBytes)}` : ""}`;
  });

  if (downloads) {
    await step("done: design pack zip", async () => {
      const t0 = Date.now();
      const btn = page.locator(".dn-file").filter({ hasText: "Design pack" }).getByRole("button");
      let buf, name, how;
      if (ARTIFACT) {
        await btn.click();
        const d = await poll(() => page.evaluate(() => window.__e2e.downloads.filter((x) => /\.zip$/.test(x.filename))), (v) => v.length > 0, { timeout: 120000, what: "a downloads.save() of the design pack" });
        name = d[0].filename;
        const b64 = await page.evaluate((n) => { const b = window.__e2e.files[n]; let s = ""; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s); }, name);
        buf = Buffer.from(b64, "base64");
        how = "downloads capability";
      } else {
        const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), btn.click()]);
        name = dl.suggestedFilename();
        const p = path.join(SHOTS, `${ENV}-${vp}-${name}`);
        await dl.saveAs(p);
        buf = fs.readFileSync(p);
        how = "<a download>";
      }
      const zip = await JSZip.loadAsync(buf);
      const entries = Object.keys(zip.files).filter((k) => !zip.files[k].dir);
      for (const want of ["order-sheet.html", "roster.csv", "order.json", "README.txt"]) assert(entries.includes(want), `${name} lacks ${want}`);
      const garments = entries.filter((e) => e.startsWith("garments/"));
      assert(garments.length >= 12, `${name} has ${garments.length} garment images, expected 12`);
      const order = JSON.parse(await zip.file("order.json").async("string"));
      assert(order.ref === S.ref, `order.json ref ${order.ref} ≠ ${S.ref}`);
      await page.locator(".dn-file.is-done").filter({ hasText: "Design pack" }).waitFor({ timeout: 10000 });
      timing("designPackMs", Date.now() - t0);
      if (ARTIFACT) fs.writeFileSync(path.join(SHOTS, `${ENV}-${vp}-${name}`), buf);
      return `${name} ${kb(buf.length)}, ${entries.length} files (${garments.length} garment JPGs) via ${how} in ${Date.now() - t0} ms`;
    });
  }

  if (ARTIFACT) {
    await step("artifact: worker + capabilities", async () => {
      const r = await page.evaluate(() => ({ stats: { ...window.__mascotRender?.stats }, pool: window.__mascotRender?.pool, mainOnly: window.__mascotRender?.mainThreadEffects, uses: [...new Set(window.__e2e.uses)], downloads: window.__e2e.downloads.map((d) => `${d.filename} (${d.kind}, ${d.size} B)`) }));
      timing("renderStatsEnd", r.stats);
      timing("workers", workers);
      timing("capabilitiesUsed", r.uses);
      timing("downloads", r.downloads);
      const notes = [`workers started: ${workers.length} (${[...new Set(workers.map((w) => w.split(":")[0]))].join(",") || "none"})`, `pool ${r.pool?.state}`, `worker jobs ${r.stats.worker}, main ${r.stats.main}, fallback ${r.stats.fallback}`, `main-only: ${(r.mainOnly || []).join(",") || "none"}`, `use(): ${r.uses.join(",")}`];
      // the inlined faces really loaded (data: fonts under font-src), lettering font included
      const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")))]; });
      for (const fam of ["Big Shoulders Display", "Archivo", "IBM Plex Mono", "Graduate"]) assert(fonts.includes(fam), `font ${fam} not loaded (loaded: ${fonts.join(", ")})`);
      notes.push(`fonts loaded: ${fonts.join(", ")}`);
      // a downloads capability that exists must be the only way files leave
      if (downloads) assert(r.downloads.length >= 2, `expected ≥ 2 downloads.save() calls, got ${r.downloads.length}`);
      return notes.join(" · ");
    });
    await step("artifact: #orders hidden for a coach", async () => {
      await page.evaluate(() => { location.hash = "#orders"; });
      await page.getByText("Only the site owner sees orders here").waitFor({ timeout: 15000 });
      return "coach sees the explanation, no inbox";
    });
  }

  if (!phone && !NO_STORAGE) {
    await step("storage: corrupt saved roster", async () => {
      await page.close(); // flushes the store (pagehide); the next page starts from what it saved
      const p2 = await context.newPage();
      p2.on("console", (m) => { if (m.type() === "error" && !expected(m.text())) errors.push(`[console.error] ${m.text()}`); });
      p2.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
      await p2.addInitScript(() => {
        if (sessionStorage.getItem("__e2eCorrupted")) return;
        sessionStorage.setItem("__e2eCorrupted", "1");
        const k = "mascot-lab:v1";
        const raw = JSON.parse(localStorage.getItem(k));
        raw.roster = [
          { name: 123, number: {}, items: null, top: ["L"], bottom: null },
          { id: "dup", name: "A", number: 7, top: "M", bottom: "M", items: { jersey: "yes", shorts: false } },
          { id: "dup", name: "B" },
          "junk", null, 42, [1, 2],
        ];
        raw.contact = { coach: { x: 1 }, email: 42, notes: null };
        raw.extras = { jersey: { M: "3", L: -1, XL: "x" }, hoodie: null };
        raw.order = { status: "draft", ref: {}, channel: 5 };
        localStorage.setItem(k, JSON.stringify(raw));
      });
      await p2.goto(`${origin}/#order`, { waitUntil: "load", timeout: 60000 });
      await p2.locator(".ord-page").waitFor({ timeout: 20000 });
      await sleep(800);
      const st = await p2.evaluate(() => window.__mascotLab.getState());
      const rows = st.roster;
      assert(rows.length === 3, `expected 3 sanitized rows, got ${rows.length}`);
      assert(new Set(rows.map((r) => r.id)).size === 3 && rows.every((r) => typeof r.id === "string" && r.id), "row ids aren't unique strings");
      for (const r of rows) for (const f of ["name", "number", "top", "bottom"]) assert(typeof r[f] === "string", `row ${r.id}.${f} is ${typeof r[f]}`);
      assert(rows.every((r) => r.items && typeof r.items === "object" && !Array.isArray(r.items)), "row items aren't plain objects");
      assert(rows[1].items.shorts === false && !("jersey" in rows[1].items), "row items weren't reduced to booleans");
      assert(Object.values(st.contact).every((v) => typeof v === "string" || typeof v === "boolean"), "contact fields aren't strings");
      assert(st.extras.jersey?.M === 3 && !("L" in st.extras.jersey) && !("hoodie" in st.extras), `extras not sanitized: ${JSON.stringify(st.extras)}`);
      const shown = await p2.locator(".ord-page input").count();
      await p2.screenshot({ path: path.join(SHOTS, `${ENV}-${vp}-corrupt-roster.png`) }).catch(() => {});
      await p2.close();
      return `#order renders ${rows.length} rows (${rows.map((r) => `${r.id}:"${r.name}"#${r.number}`).join(", ")}), ${shown} inputs`;
    });
  }

  facts[tag] = { ...(facts[tag] || {}), warnings: [...warnings].filter((w) => !/willReadFrequently|getImageData/.test(w)).slice(0, 12), renderInfo: infos.slice(0, 3) };
  if (!ARTIFACT) facts[tag].workers = workers;
  await context.close();
  return S;
}

/** Artifact only: the owner opens the page and sees the coach's order in the inbox. */
async function ownerFlow(browser, origin, db, expectRefs, absentRefs) {
  const tag = `${ENV}/desktop/owner`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const owner = { uid: "u_owner_1", level: "owner", isOwner: true, canWrite: true, caps: ["downloads", "db", "user"] };
  await context.addInitScript(probeInit);
  await context.addInitScript(claudeMock, owner);
  await context.exposeBinding("__e2eDb", (_s, op, a) => db.handle({ uid: owner.uid, level: owner.level }, op, a));
  const offsite = [];
  await context.route("**/*", (route) => {
    const u = route.request().url();
    if (u === origin + "/" || u.startsWith(origin + "/#")) return route.continue();
    offsite.push(u.slice(0, 160));
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  const expected = (t) => WORKER_SRC != null && /Refused to create a worker|^\[csp\] worker-src/.test(t);
  page.on("console", (m) => { if (m.type() === "error" && !expected(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  const run = async (name, fn) => {
    const t0 = Date.now();
    let status = "pass", note = "";
    const e0 = errors.length;
    try {
      note = (await fn()) || "";
      const csp = await page.evaluate(() => (window.__e2eCsp || []).splice(0)).catch(() => []);
      for (const c of csp) { const t = `[csp] ${c.directive} blocked ${c.blocked}`; if (!expected(t)) errors.push(t); }
      if (errors.length > e0) throw new StepError(`console/page errors: ${errors.slice(e0, e0 + 5).join(" | ")}`);
      if (offsite.length) throw new StepError(`network requests: ${offsite.join(", ")}`);
    } catch (e) { status = "FAIL"; note = e.message.split("\n")[0]; }
    try { await page.screenshot({ path: path.join(SHOTS, `${ENV}-owner-${name.replace(/[^a-z0-9]+/gi, "-")}.png`) }); } catch { /* */ }
    results.push({ env: ENV, vp: tag, step: name, status, ms: Date.now() - t0, note });
    console.log(`  ${status === "pass" ? "ok  " : "FAIL"} ${tag.padEnd(26)} ${name.padEnd(34)} ${String(Date.now() - t0).padStart(6)} ms  ${note.slice(0, 150)}`);
  };
  await run("owner: inbox lists the order", async () => {
    await page.goto(`${origin}/#orders`, { waitUntil: "load" });
    await page.locator(".ib-ref").first().waitFor({ timeout: 30000 });
    const refs = await page.locator(".ib-ref").allInnerTexts();
    for (const r of expectRefs) assert(refs.some((x) => x.includes(r)), `inbox lacks ${r} (has ${refs.join(", ")})`);
    for (const r of absentRefs) assert(!refs.some((x) => x.includes(r)), `inbox shows ${r}, which was never sent`);
    // status change → the owner-only orders/_status document
    const ref = expectRefs[0];
    await page.getByLabel(`Status of ${ref}`).selectOption("proof-sent");
    await pollBase(async () => db.docs.get("orders/_status")?.statuses?.[ref]?.status, (v) => v === "proof-sent", { timeout: 10000, what: "orders/_status" });
    // …and the live subscription brings it back into the row
    await pollBase(() => page.getByLabel(`Status of ${ref}`).inputValue(), (v) => v === "proof-sent", { timeout: 10000, what: "the status select to show proof-sent" });
    const coachDocs = [...db.docs.keys()].filter((k) => /^orders\/u_coach/.test(k));
    return `inbox: ${refs.map((x) => x.trim()).join(", ")}; status → proof-sent in orders/_status; coach docs untouched: ${coachDocs.join(", ")}`;
  });
  await run("owner: sample SVGs decode (crest, N)", async () => {
    await page.evaluate(() => { location.hash = "#studio"; });
    const out = [];
    for (const name of ["Round crest", "Varsity N", "Bulldog head"]) {
      const before = await page.evaluate(`(${PRINT_FN})(document.querySelector(".st-logocard__preview canvas"))`);
      await page.getByRole("button", { name: new RegExp(name) }).click();
      const v = await pollBase(
        () => page.evaluate(`(() => { const c = document.querySelector(".st-logocard__preview canvas"); return { print: (${PRINT_FN})(c), ink: (${INK_FN})(c), err: !!document.querySelector(".st-logocard .ml-canvas__error") }; })()`),
        (x) => x.err || (x.print !== before && x.ink > 500),
        { timeout: 20000, what: `${name} to decode` },
      );
      assert(!v.err, `${name}: "Couldn't read this logo"`);
      out.push(`${name} ✓`);
      await sleep(300);
    }
    return out.join(", ");
  });
  await context.close();
}

/* ───────────────────────────── main ───────────────────────────── */

fs.mkdirSync(SHOTS, { recursive: true });
let srv;
if (ARTIFACT) {
  if (!fs.existsSync(PAGE_FILE)) { console.error(`no ${path.relative(ROOT, PAGE_FILE)} — run npm run build:artifact first`); process.exit(1); }
  srv = await artifactServer(PAGE_FILE);
  facts.size = { artifactFile: fs.statSync(PAGE_FILE).size, servedPage: srv.bytes };
  console.log(`e2e [artifact] ${path.relative(ROOT, PAGE_FILE)} (${kb(facts.size.artifactFile)}) at ${srv.origin} · CSP: ${CSP}`);
} else {
  if (!fs.existsSync(path.join(DIST, "index.html"))) { console.error(`no ${DIST}/index.html — build first (npm run build)`); process.exit(1); }
  srv = await staticServer(DIST);
  facts.size = { dist: dirSize(DIST), files: fs.readdirSync(path.join(DIST, "assets")).length + 2 };
  console.log(`e2e [static] ${DIST} (${kb(facts.size.dist)}) at ${srv.origin}`);
}

const browser = await chromium.launch({ executablePath: findChromium(), args: ["--disable-gpu"] });
const db = new MockDb(DB_RULES);
const t0 = Date.now();
try {
  const scenarios = {
    static: {
      desktop: { channel: "local", doneText: ["Saved on this device", "This preview isn't connected to an order inbox yet, so your order was saved on this device."] },
      phone: { channel: "local", doneText: ["Saved on this device", "This preview isn't connected to an order inbox yet, so your order was saved on this device."] },
    },
    artifact: {
      // a Contributor: may write their own orders/<uid> under the declared rules
      desktop: { label: "coach", channel: "artifact-db", doneText: ["Request sent", "Order request sent. We'll email a proof to coach@northgate.example"],
        claude: { uid: "u_coach_desk", level: "interact", isOwner: false, canWrite: true, caps: ["downloads", "db", "user"] } },
      // a view-only member: the rules refuse the write; the page must say it saved locally
      phone: { label: "viewonly", channel: "local", refusedWrite: true, doneText: ["Saved on this device", "Your account can't send orders from this page, so your order was saved on this device."],
        claude: { uid: "u_coach_phone", level: "view", isOwner: false, canWrite: false, caps: ["downloads", "db", "user"] } },
      // signed out / nothing granted: every use() resolves null (downloads skipped: the
      // <a download> fallback works in this harness but is inert in the real frame)
      signedout: { label: "nullcaps", channel: "local", noDownloads: true, doneText: ["Saved on this device", "This page can't reach the order inbox for your account, so your order was saved on this device."],
        claude: { uid: null, level: "view", isOwner: false, canWrite: null, caps: [] } },
    },
  }[ENV];
  const refs = {};
  for (const vp of VIEWPORTS) {
    const sc = scenarios[vp];
    if (!sc) continue;
    const st = await runFlow(browser, srv.origin, vp, sc, db);
    refs[vp] = st.ref;
  }
  if (ARTIFACT && refs.desktop) await ownerFlow(browser, srv.origin, db, [refs.desktop], [refs.phone, refs.signedout].filter(Boolean));
} finally {
  await browser.close();
  srv.server.close();
}

facts.serverHits = [...new Set(srv.hits)].length > 12 ? `${srv.hits.length} requests, ${new Set(srv.hits).size} paths` : [...new Set(srv.hits)];
const failed = results.filter((r) => r.status === "FAIL");
const skipped = results.filter((r) => r.status === "skip");
console.log(`\n${ENV}: ${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped in ${Math.round((Date.now() - t0) / 1000)} s`);
console.log(JSON.stringify(facts, null, 1));
if (JSON_OUT) fs.writeFileSync(path.resolve(ROOT, String(JSON_OUT)), JSON.stringify({ env: ENV, results, facts }, null, 1));
if (failed.length) {
  console.error(`\nFAILED:\n${failed.map((f) => `  ${f.vp} · ${f.step}: ${f.note}`).join("\n")}`);
  process.exit(1);
}
