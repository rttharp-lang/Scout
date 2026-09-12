// Smoke test: start the real server on a temp DB, log in through the UI, walk
// every screen (desktop + mobile), fail on page errors, save screenshots.
//   node scripts/smoke.mjs   (run `vite build` first)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright";

const PORT = 8790; const BASE = `http://localhost:${PORT}`;
const OUT = process.env.SMOKE_OUT || path.join(os.tmpdir(), "local-smoke");
fs.mkdirSync(OUT, { recursive: true });
const dbPath = path.join(os.tmpdir(), `local-smoke-${Date.now()}.db`);
const server = spawn(process.execPath, ["server/index.js"], { env: { ...process.env, PORT: String(PORT), LOCAL_DB_PATH: dbPath, NODE_ENV: "production", LOCAL_SEED_DEMO: "true" }, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
server.stderr.on("data", (d) => { const s = String(d); if (!/ExperimentalWarning|trace-warnings/.test(s)) process.stderr.write(`[server] ${s}`); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {} await wait(500); } throw new Error("server not ready"); }

function chromiumPath() { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers"; try { for (const d of fs.readdirSync(base)) if (d.startsWith("chromium-")) { const p = path.join(base, d, "chrome-linux", "chrome"); if (fs.existsSync(p)) return p; } } catch {} return undefined; }

const failures = [];
async function walk(page, label, routes) {
  for (const [name, url] of routes) {
    const errors = [];
    const onErr = (e) => errors.push(e.message); page.on("pageerror", onErr);
    await page.goto(`${BASE}${url}`, { waitUntil: "load" });
    await page.waitForFunction(() => !/Loading…/.test(document.body.textContent || ""), null, { timeout: 15000 }).catch(() => {});
    await wait(700);
    const text = await page.textContent("body");
    if (/Error:|Loading…$/.test(text || "") && !/Error: none/.test(text)) failures.push(`${label} ${name}: page shows error or never loaded`);
    if (errors.length) failures.push(`${label} ${name}: ${errors.join(" | ")}`);
    await page.screenshot({ path: path.join(OUT, `${label}-${name}.png`), fullPage: name !== "team-overview" });
    page.off("pageerror", onErr);
    console.log(`ok ${label} ${name}${errors.length ? " (errors)" : ""}`);
  }
}

try {
  await ready();
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@local.dev"); await page.fill("#pw", "local-admin"); await page.click("form button");
  await page.waitForURL(/\/w\//, { timeout: 10000 });
  const routes = [["directory", "/w/ws_demo"], ["portfolio", "/w/ws_demo/portfolio"], ["team-overview", "/w/ws_demo/teams/nba-chi"], ["team-identity", "/w/ws_demo/teams/nba-chi/identity"], ["team-communities", "/w/ws_demo/teams/nba-chi/communities"], ["team-culture", "/w/ws_demo/teams/nba-chi/culture"], ["team-season", "/w/ws_demo/teams/nba-chi/season"], ["team-growth", "/w/ws_demo/teams/nba-chi/growth"], ["team-uniform", "/w/ws_demo/teams/nba-chi/uniform"], ["team-studio", "/w/ws_demo/teams/nba-chi/studio"], ["team-evidence", "/w/ws_demo/teams/nba-chi/evidence"], ["team-ask", "/w/ws_demo/teams/nba-chi/ask"], ["lynx-overview", "/w/ws_demo/teams/wnba-min"], ["lynx-season", "/w/ws_demo/teams/wnba-min/season"], ["unresearched", "/w/ws_demo/teams/wnba-tor"], ["taxonomy", "/w/ws_demo/taxonomy"], ["studio", "/w/ws_demo/studio"], ["evidence", "/w/ws_demo/evidence"], ["across", "/w/ws_demo/across"], ["settings", "/w/ws_demo/settings"], ["live-directory", "/w/ws_live"]];
  await walk(page, "desktop", routes);
  // Claim drawer + territory drawer interactions
  await page.goto(`${BASE}/w/ws_demo/teams/nba-chi`, { waitUntil: "load" });
  await page.click(".story >> nth=0"); await page.waitForSelector(".drawer"); await wait(500);
  await page.screenshot({ path: path.join(OUT, "desktop-claim-drawer.png") });
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/w/ws_demo/teams/nba-chi/uniform`, { waitUntil: "load" });
  await page.click("button:text-is(\"Open\") >> nth=0"); await page.waitForSelector(".drawer"); await wait(500);
  await page.screenshot({ path: path.join(OUT, "desktop-territory.png") });
  // Ask
  await page.goto(`${BASE}/w/ws_demo/teams/nba-chi/ask`, { waitUntil: "load" });
  await page.fill("input.input", "What do fans do before the intro?"); await page.click("button.team"); await wait(800);
  await page.screenshot({ path: path.join(OUT, "desktop-ask.png"), fullPage: true });
  // Mobile
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  await mp.goto(`${BASE}/login`); await mp.fill("#email", "viewer@local.dev"); await mp.fill("#pw", "local-viewer"); await mp.click("form button"); await mp.waitForURL(/\/w\//);
  await walk(mp, "mobile", [["directory", "/w/ws_demo"], ["team-overview", "/w/ws_demo/teams/nba-chi"], ["team-season", "/w/ws_demo/teams/nba-chi/season"], ["team-uniform", "/w/ws_demo/teams/wnba-min/uniform"]]);
  // Viewer must not see restricted responses
  const r = await mp.request.get(`${BASE}/api/workspaces/ws_demo/entities/research_response`);
  if (r.status() !== 403) failures.push(`viewer could list research responses (status ${r.status()})`);
  await browser.close();
} catch (e) { failures.push(String(e.stack || e)); }
finally { server.kill(); try { fs.rmSync(dbPath, { force: true }); fs.rmSync(dbPath + "-wal", { force: true }); fs.rmSync(dbPath + "-shm", { force: true }); } catch {} }
if (failures.length) { console.error("SMOKE FAILURES:\n" + failures.join("\n")); process.exit(1); }
console.log(`Smoke passed. Screenshots in ${OUT}`);
