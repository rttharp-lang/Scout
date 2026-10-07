// Home Court smoke test: serve the production build, open /nba/ in a real
// browser at phone and desktop widths, walk every route (overview, a published
// market, calendar, agents), and fail on uncaught errors, missing content or
// horizontal page overflow. Uses the published research in src/nba/data.
//
// Run with:  npm run smoke   (builds first)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try { for (const d of fs.readdirSync(base)) { if (d.startsWith("chromium-") && !d.includes("headless")) { const p = path.join(base, d, "chrome-linux", "chrome"); if (fs.existsSync(p)) return p; } } } catch {}
  return undefined;
}
const PORT = 4176, BASE = `http://localhost:${PORT}/nba/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const summary = JSON.parse(fs.readFileSync(new URL("../src/nba/data/summary.json", import.meta.url), "utf8"));
const published = summary.filter((s) => s.status === "complete").map((s) => s.id);
const SHOTS = process.env.HC_SHOTS; // optional dir for screenshots

async function main() {
  const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  let browser;
  const problems = [];
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await wait(300); }
    browser = await chromium.launch({ headless: true, executablePath: findChromium() });
    const market = published.includes("por") ? "por" : published[0];
    const routes = [
      ["overview", "#/", /Home\s*Court/i],
      ["calendar", "#/calendar", /League\s*calendar/i],
      ["opportunities", "#/opportunities", /Opportunity\s*board/i],
      ["compare", "#/compare", /Compare\s*markets/i],
      ["agents", "#/agents", /Fifteen agents/i],
      ...(market ? [["market", `#/m/${market}`, /Opportunities[\s\S]*Product[\s\S]*Agent review/i]] : []),
      ["pending-or-unknown", "#/m/zzz", /Unknown market/i],
    ];
    for (const vp of [{ width: 390, height: 844, label: "phone" }, { width: 1280, height: 900, label: "desktop" }]) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message || String(e)));
      for (const [name, hash, expect] of routes) {
        await page.goto(BASE + hash, { waitUntil: "load", timeout: 20000 });
        await wait(900);
        const txt = (await page.textContent("#root")) || "";
        if (!expect.test(txt)) problems.push(`[${vp.label}] ${name}: expected ${expect} (got ${txt.length} chars)`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) problems.push(`[${vp.label}] ${name}: page scrolls horizontally by ${overflow}px`);
        if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${vp.label}-${name}.png`), fullPage: true }); }
      }
      if (market) {
        // Culture tabs switch lenses; the rhythm chart renders 12 columns.
        await page.goto(BASE + `#/m/${market}`, { waitUntil: "load" });
        await wait(900);
        const cols = await page.locator("#calendar svg path").count();
        if (cols < 12) problems.push(`[${vp.label}] rhythm chart rendered ${cols} columns`);
        await page.getByRole("tab", { name: "Food Scene" }).click();
        await wait(200);
        if (!/Food Scene agent/.test((await page.textContent("#culture")) || "")) problems.push(`[${vp.label}] culture tabs did not switch to Food Scene`);
      }
      if (errors.length) problems.push(`[${vp.label}] page errors: ${errors.join("; ")}`);
      await page.close();
    }
    if (problems.length) { console.error("✗ Home Court smoke FAILED\n  " + problems.join("\n  ")); process.exitCode = 1; }
    else console.log(`✓ Home Court smoke passed — ${published.length} published market(s), all routes render at phone + desktop with no errors or overflow.`);
  } catch (e) {
    console.error("✗ Home Court smoke errored:", e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    preview.kill("SIGTERM");
  }
}
main();
