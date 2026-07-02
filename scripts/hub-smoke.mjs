// Boots the app straight into the TRIP HUB with a mock curation payload (via the
// scout.hubmock localStorage hook) to verify the hub renders complete: sections,
// pre-selections, editor's pick badge, footer, clickable logo — at phone AND
// desktop widths. No live AI involved.
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
    { name: "Court Culture Run", neighborhood: "Downtown", category: "sport", why: "Where the city actually hoops.", during: false },
  ],
};

async function main() {
  const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  let browser;
  const problems = [];
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch {} await wait(300); }
    browser = await chromium.launch({ headless: true, executablePath: findChromium() });

    for (const vp of [{ width: 390, height: 844, label: "phone" }, { width: 1280, height: 900, label: "desktop" }]) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message || String(e)));
      await page.addInitScript((m) => { try { localStorage.setItem("scout.hubmock", JSON.stringify(m)); } catch {} }, mock);
      await page.goto(URL, { waitUntil: "load", timeout: 20000 });
      await wait(1500);
      const txt = (await page.textContent("#root")) || "";

      if (errors.length) problems.push(`[${vp.label}] page errors: ${errors.join("; ")}`);
      for (const needle of ["Las Vegas", "Neighborhoods", "Shopping", "Food & Restaurants", "Events & Experiences", "Editor's pick", "Vintage A", "Lunch One", "Powered by Anthropic", "Don't miss a drop"]) {
        if (!txt.includes(needle)) problems.push(`[${vp.label}] missing: "${needle}"`);
      }
      if (txt.includes("Empty Hood")) problems.push(`[${vp.label}] empty neighborhood rendered`);

      // Pre-selections: 2 hoods + 5 stores + 1 lunch + 1 dinner = 9 checks on;
      // experiences must start unselected.
      const onCount = await page.locator('[aria-pressed="true"]').count();
      if (onCount !== 9) problems.push(`[${vp.label}] expected 9 pre-selected checks, got ${onCount}`);
      const expOn = await page.locator('[aria-label="Deselect Gallery Show X"][aria-pressed="true"]').count();
      if (expOn !== 0) problems.push(`[${vp.label}] experience is pre-selected`);

      // Logo is a real link home.
      const logoHref = await page.locator('a[aria-label="Scout — home"]').first().getAttribute("href");
      if (logoHref !== "/") problems.push(`[${vp.label}] logo href is ${logoHref}`);

      // Card shape: square on phone, wide on desktop (first Shopping card).
      const dims = await page.evaluate(() => {
        const el = document.querySelector(".hub-stack > *");
        return el ? { w: el.offsetWidth, h: el.offsetHeight } : null;
      });
      if (!dims) problems.push(`[${vp.label}] no hub-stack card found`);
      else if (vp.label === "phone" && Math.abs(dims.w - dims.h) > 4) problems.push(`[phone] card not square: ${dims.w}x${dims.h}`);
      else if (vp.label === "desktop" && dims.w <= dims.h) problems.push(`[desktop] card not landscape: ${dims.w}x${dims.h}`);

      // Dots: hidden on phone for stacks, visible on desktop.
      const dotsVisible = await page.evaluate(() => {
        const d = document.querySelectorAll(".hub-dots-desktop");
        return Array.from(d).some((el) => getComputedStyle(el).display !== "none");
      });
      if (vp.label === "phone" && dotsVisible) problems.push("[phone] stack dots visible");
      if (vp.label === "desktop" && !dotsVisible) problems.push("[desktop] stack dots hidden");

      await page.close();
    }

    if (problems.length) {
      console.error("✗ Hub smoke FAILED:\n  " + problems.join("\n  "));
      process.exitCode = 1;
    } else {
      console.log("✓ Hub smoke passed — Trip Hub renders complete at phone + desktop widths.");
    }
  } catch (e) { console.error("✗ errored:", e.message); process.exitCode = 1; }
  finally { if (browser) await browser.close(); preview.kill("SIGTERM"); }
}
main();
