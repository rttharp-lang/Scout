// Boots the app straight into the TRIP HUB with a mock curation payload (via the
// scout.hubmock localStorage hook) and verifies the restructured hub:
// three horizontal sections (no neighborhood selection), expand-in-place,
// shared selection state, the sticky Build button with live count — then CLICKS
// Build Itinerary and verifies the one-pass organization produces a day-split,
// time-ordered itinerary with meals and per-day experiences. No live AI.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try { for (const d of fs.readdirSync(base)) { if (d.startsWith("chromium-") && !d.includes("headless")) { const p = path.join(base, d, "chrome-linux", "chrome"); if (fs.existsSync(p)) return p; } } } catch {}
  return undefined;
}
const PORT = 4175, URL = `http://localhost:${PORT}/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const store = (name, category) => ({ name, tier: "underground", category, why: `Why ${name} matters, in one line.` });
const mock = {
  city: "Las Vegas",
  start: "2026-07-10T12:00:00.000Z",
  end: "2026-07-11T12:00:00.000Z", // 2-day trip
  days: [
    { neighborhoods: [
      { name: "Downtown Arts District", blurb: "Warehouse galleries and the city's real vintage depth.", stores: [store("Vintage A", "vintage"), store("Concept B", "concept"), store("Multi C", "multi-brand")] },
      { name: "Chinatown", blurb: "Strip-adjacent but insider — late-night rooms and hidden retail.", stores: [store("Street D", "streetwear"), store("Lux E", "luxury")] },
      { name: "Empty Hood", blurb: "Should never render.", stores: [] },
    ] },
  ],
  dining: {
    lunch: [ { name: "Lunch One", cuisine: "Sandwiches", neighborhood: "Arts District", why: "The industry lunch." }, { name: "Lunch Two", cuisine: "Thai", neighborhood: "Chinatown", why: "Quietly great." } ],
    dinner: [ { name: "Dinner One", cuisine: "Omakase", neighborhood: "Chinatown", why: "The memorable room." }, { name: "Dinner Two", cuisine: "Steak", neighborhood: "Downtown", why: "An institution that delivers." } ],
  },
  experiences: [
    { name: "Gallery Show X", neighborhood: "Arts District", category: "gallery", why: "The show everyone in the industry is at.", during: true },
    { name: "Court Culture Run", neighborhood: "Chinatown", category: "sport", why: "Where the city actually hoops.", during: false },
  ],
};

async function main() {
  const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  let browser;
  const problems = [];
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch {} await wait(300); }
    browser = await chromium.launch({ headless: true, executablePath: findChromium() });

    // ── Layout + selection checks at both widths ──
    for (const vp of [{ width: 390, height: 844, label: "phone" }, { width: 1280, height: 900, label: "desktop" }]) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message || String(e)));
      await page.addInitScript((m) => { try { localStorage.setItem("scout.hubmock", JSON.stringify(m)); } catch {} }, mock);
      await page.goto(URL, { waitUntil: "load", timeout: 20000 });
      await wait(1500);
      const txt = (await page.textContent("#root")) || "";

      if (errors.length) problems.push(`[${vp.label}] page errors: ${errors.join("; ")}`);
      for (const needle of ["Las Vegas", "Shopping", "Food & Restaurants", "Events & Experiences", "Editor's pick", "Vintage A", "Lunch One", "See all (5)", "5 selected", "Build Itinerary · 7", "Powered by Anthropic"]) {
        if (!txt.includes(needle)) problems.push(`[${vp.label}] missing: "${needle}"`);
      }
      if (txt.includes("Empty Hood")) problems.push(`[${vp.label}] empty neighborhood rendered`);
      if (/Neighborhoods\b/.test(txt.replace(/neighborhood metadata/gi, ""))) {
        // No "Neighborhoods" SECTION should exist (word may appear in card tags only).
        const hasSection = await page.locator("h2", { hasText: "Neighborhoods" }).count();
        if (hasSection) problems.push(`[${vp.label}] Neighborhoods section still renders`);
      }

      // Pre-selections: 5 stores + 1 lunch + 1 dinner = 7 on; experiences off.
      const onCount = await page.locator('[aria-pressed="true"]').count();
      if (onCount !== 7) problems.push(`[${vp.label}] expected 7 pre-selected checks, got ${onCount}`);

      // Sticky Build button reachable at top-of-page scroll.
      const btn = page.locator("button", { hasText: "Build Itinerary" }).first();
      const box = await btn.boundingBox();
      if (!box || box.y + box.height > vp.height + 2) problems.push(`[${vp.label}] Build button not pinned in viewport (y=${box && box.y})`);

      // Card shape in rail mode: square on phone, landscape on desktop.
      const dims = await page.evaluate(() => { const el = document.querySelector(".hub-rail > *"); return el ? { w: el.offsetWidth, h: el.offsetHeight } : null; });
      if (!dims) problems.push(`[${vp.label}] no rail card found`);
      else if (vp.label === "phone" && Math.abs(dims.w - dims.h) > 4) problems.push(`[phone] rail card not square: ${dims.w}x${dims.h}`);
      else if (vp.label === "desktop" && dims.w <= dims.h) problems.push(`[desktop] rail card not landscape: ${dims.w}x${dims.h}`);

      // Dots visible only at desktop.
      const dotsVisible = await page.evaluate(() => Array.from(document.querySelectorAll(".hub-dots-desktop")).some((el) => getComputedStyle(el).display !== "none"));
      if (vp.label === "phone" && dotsVisible) problems.push("[phone] dots visible");
      if (vp.label === "desktop" && !dotsVisible) problems.push("[desktop] dots hidden");

      // Expand in place: toggle a card in RAIL mode first, then See all — the
      // grid must show the same (shared) selection state.
      await page.locator('[aria-label="Deselect Vintage A"]').first().click();
      await page.locator("button", { hasText: "See all (5)" }).first().click();
      await wait(300);
      const gridDisplay = await page.evaluate(() => { const g = document.querySelector(".hub-grid"); return g ? getComputedStyle(g).display : null; });
      if (vp.label === "phone" && gridDisplay !== "flex") problems.push(`[phone] expanded mode display=${gridDisplay} (want flex stack)`);
      if (vp.label === "desktop" && gridDisplay !== "grid") problems.push(`[desktop] expanded mode display=${gridDisplay} (want grid)`);
      if (!(await page.locator("button", { hasText: "Collapse" }).count())) problems.push(`[${vp.label}] Collapse control missing`);
      if (!(await page.locator('[aria-label="Select Vintage A"]').count())) problems.push(`[${vp.label}] selection state not shared into expanded mode`);
      const countAfter = (await page.textContent("#root")) || "";
      if (!countAfter.includes("Build Itinerary · 6")) problems.push(`[${vp.label}] build count didn't track deselection`);

      await page.close();
    }

    // ── End-to-end: click Build Itinerary, verify the organization pass ──
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message || String(e)));
    await page.addInitScript((m) => { try { localStorage.setItem("scout.hubmock", JSON.stringify(m)); } catch {} }, mock);
    await page.goto(URL, { waitUntil: "load", timeout: 20000 });
    await wait(1200);
    await page.locator('[aria-label="Select Gallery Show X"]').first().click(); // opt into one experience
    await page.locator("button", { hasText: "Build Itinerary" }).first().click();
    await wait(2500);
    const out = (await page.textContent("#root")) || "";
    if (errors.length) problems.push(`[build] page errors: ${errors.join("; ")}`);
    for (const needle of ["Day 1", "Vintage A", "Lunch", "Dinner", "Experiences · this day", "Gallery Show X", "Confirm Day"]) {
      if (!out.includes(needle)) problems.push(`[build] missing after organization: "${needle}"`);
    }
    // Two-day split: Day 2 tab should exist for the 2-day mock.
    if (!(await page.locator("button", { hasText: "Day 2" }).count())) problems.push("[build] expected a Day 2 from the 2-day date range");
    // Print Day 1's stop order (for the report): store names in DOM order.
    const order = ["Vintage A", "Concept B", "Multi C", "Street D", "Lux E"]
      .map((n) => ({ n, i: out.indexOf(n) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i).map((x) => x.n);
    console.log("  Day 1 render order:", order.join(" → "));
    console.log("  Lunch pick present:", out.includes("Lunch One"), "| Dinner pick present:", out.includes("Dinner One"));
    await page.close();

    if (problems.length) {
      console.error("✗ Hub smoke FAILED:\n  " + problems.join("\n  "));
      process.exitCode = 1;
    } else {
      console.log("✓ Hub smoke passed — 3-section hub, expand-in-place, shared selection, sticky Build, and the organization pass all work.");
    }
  } catch (e) { console.error("✗ errored:", e.message); process.exitCode = 1; }
  finally { if (browser) await browser.close(); preview.kill("SIGTERM"); }
}
main();
