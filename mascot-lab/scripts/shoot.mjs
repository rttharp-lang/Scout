// Screenshot any page of the dev server (or any URL) with the pre-installed
// Chromium, so agents and humans can *look* at what they built.
//
//   node scripts/shoot.mjs <url> <out.png> [--width=1400] [--height=900]
//        [--full] [--mobile] [--dpr=1] [--ready] [--timeout=90000]
//        [--wait=<css selector>] [--click=<css selector>] [--dark]
//
// --ready   waits until the page sets `window.__READY = true` (harness pages do)
//           and prints `window.__RESULTS` (if set) as JSON.
// --mobile  390×844 @2x with touch.
// Console errors and uncaught page errors are always printed, prefixed
// "[console.error]" / "[pageerror]", and make the exit code 2 (shot still saved).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  const direct = path.join(base, "chromium");
  if (fs.existsSync(direct)) return direct;
  try {
    for (const d of fs.readdirSync(base)) {
      if (d.startsWith("chromium-") && !d.includes("headless")) {
        const p = path.join(base, d, "chrome-linux", "chrome");
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}
  return undefined;
}

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith("--"));
const flag = (name, dflt) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};
const [url, out = ".shots/shot.png"] = pos;
if (!url) {
  console.error("usage: node scripts/shoot.mjs <url> <out.png> [--full] [--ready] ...");
  process.exit(1);
}
const mobile = !!flag("mobile", false);
const width = Number(flag("width", mobile ? 390 : 1400));
const height = Number(flag("height", mobile ? 844 : 900));
const dpr = Number(flag("dpr", mobile ? 2 : 1));
const timeout = Number(flag("timeout", 90000));

const browser = await chromium.launch({ executablePath: findChromium(), args: ["--disable-gpu"] });
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: dpr,
  isMobile: mobile,
  hasTouch: mobile,
  colorScheme: flag("dark", false) ? "dark" : "light",
});
const page = await context.newPage();
let bad = 0;
page.on("console", (m) => {
  if (m.type() === "error") { bad++; console.log("[console.error]", m.text()); }
  else if (m.type() === "warning") console.log("[console.warn]", m.text());
});
page.on("pageerror", (e) => { bad++; console.log("[pageerror]", e.message); });

const t0 = Date.now();
await page.goto(url, { waitUntil: "load", timeout });
if (flag("ready", false)) {
  await page.waitForFunction(() => window.__READY === true, null, { timeout, polling: 200 });
  const results = await page.evaluate(() => window.__RESULTS ?? null);
  if (results) console.log(JSON.stringify(results, null, 1));
}
const waitSel = flag("wait", null);
if (waitSel) await page.waitForSelector(waitSel, { timeout });
const clickSel = flag("click", null);
if (clickSel) { await page.click(clickSel); await page.waitForTimeout(800); }
await page.waitForTimeout(Number(flag("settle", 400)));
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
await page.screenshot({ path: out, fullPage: !!flag("full", false) });
console.log(`saved ${out} (${Date.now() - t0}ms)`);
await browser.close();
process.exit(bad ? 2 : 0);
