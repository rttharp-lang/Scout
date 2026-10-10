// FandomScout.com landing smoke: serves dist/ with fandomscout.com mapped to
// localhost and checks index.html's landing rule. A plain visit opens NBA Fandom
// (/nba/); Scout's own flows (?app=scout, ?city=, sign-in returns, a tab that
// already opened Scout) stay in Scout; other hosts are untouched.
//   npm run build && node scripts/landing-smoke.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try { for (const d of fs.readdirSync(base)) { if (d.startsWith("chromium-") && !d.includes("headless")) { const p = path.join(base, d, "chrome-linux", "chrome"); if (fs.existsSync(p)) return p; } } } catch {}
  return undefined;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn("python3", ["-m", "http.server", "4193", "--bind", "127.0.0.1", "--directory", DIST], { stdio: "ignore" });
let fail = 0;
const check = (name, ok, got) => { console.log(`${ok ? "PASS" : "FAIL"} ${name} → ${got}`); if (!ok) fail++; };
try {
  await wait(800);
  const browser = await chromium.launch({ executablePath: findChromium(), args: ["--host-resolver-rules=MAP fandomscout.com 127.0.0.1:4193, MAP www.fandomscout.com 127.0.0.1:4193, MAP other.example 127.0.0.1:4193"] });
  const go = async (ctx, url) => { const p = await ctx.newPage(); await p.goto(url, { waitUntil: "load" }); await wait(600); const u = p.url(); await p.close(); return u; };
  let ctx = await browser.newContext();
  let u = await go(ctx, "http://fandomscout.com/"); check("plain visit lands on NBA Fandom", /\/nba\/$/.test(u), u);
  u = await go(ctx, "http://www.fandomscout.com/"); check("www lands on NBA Fandom", /\/nba\/$/.test(u), u);
  u = await go(ctx, "http://fandomscout.com/?city=Portland%2C%20OR"); check("trip deep link stays in Scout", !/\/nba\//.test(u), u);
  await ctx.close(); ctx = await browser.newContext();
  u = await go(ctx, "http://fandomscout.com/#access_token=abc&refresh_token=def"); check("sign-in return stays in Scout", !/\/nba\//.test(u), u);
  await ctx.close(); ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("http://fandomscout.com/?app=scout", { waitUntil: "load" }); await wait(600);
  check("Scout link from the NBA header stays in Scout", !/\/nba\//.test(p.url()), p.url());
  await p.goto("http://fandomscout.com/", { waitUntil: "load" }); await wait(600);
  check("Scout home after that, same tab, stays in Scout", !/\/nba\//.test(p.url()), p.url());
  await ctx.close(); ctx = await browser.newContext();
  u = await go(ctx, "http://fandomscout.com/nba/#/m/por"); check("deep link to a market works", /\/nba\/#\/m\/por$/.test(u), u);
  u = await go(ctx, "http://other.example/"); check("other hosts are untouched", !/\/nba\//.test(u), u);
  await browser.close();
} finally { srv.kill(); }
if (fail) { console.error(`✗ Landing smoke FAILED (${fail})`); process.exit(1); }
console.log("✓ Landing smoke passed — FandomScout.com opens NBA Fandom and Scout stays reachable.");
