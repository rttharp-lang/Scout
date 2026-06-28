// Boots the app straight into the REVIEW screen with a mock trip (via
// localStorage restore) to catch render crashes the input-only smoke misses.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try { for (const d of fs.readdirSync(base)) { if (d.startsWith("chromium-") && !d.includes("headless")) { const p = path.join(base, d, "chrome-linux", "chrome"); if (fs.existsSync(p)) return p; } } } catch {}
  return undefined;
}
const PORT = 4174, URL = `http://localhost:${PORT}/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const stop = (id, name) => ({ id, name, tier: "underground", why: "A sharp one-liner about why this store matters.", hub: "SoHo", dwell: 16, rating: 4.5, reviews: 120, hours: "10:00–19:00", openAt: 600, address: "123 Spring St, New York", lat: 40.723, lng: -74.001, price: 2, photos: [], confirmed: false, addedByUser: false, arriveMin: 600, eta: "10:00 AM" });
const meal = (name) => ({ name, cuisine: "Modern bistro", price: 3, why: "A beautiful room with a story.", rating: 4.6, address: "1 Mott St, New York", lat: 40.72, lng: -73.997, photos: [] });
const day = (dayNum) => ({ dayNum, label: "SoHo → Nolita", date: "Jul 1", confirmed: false, lunch: meal("Lunch Spot"), dinner: meal("Dinner Spot"), lunchPicks: [meal("Pick A")], lunchSearch: [], dinnerPicks: [meal("Pick B")], dinnerSearch: [], addCandidates: [], lunchAfterId: "a", lunchAt: "1:00 PM", lunchAnchor: null, itinerary: [ { hub: "SoHo", time: "~1 hr", arrive: "Start here", stops: [stop("a", "Store A"), stop("b", "Store B")] }, { hub: "Nolita", time: "~50 min", arrive: "From SoHo", stops: [stop("c", "Store C")] } ] });
const session = { city: "New York", tiers: ["underground", "streetwear"], trip: [day(1), day(2)], activeDay: 0, locked: false, screen: "review", hotel: { name: "Hotel", address: "X", lat: 40.71, lng: -74.0 } };

async function main() {
  const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  let browser;
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch {} await wait(300); }
    browser = await chromium.launch({ headless: true, executablePath: findChromium() });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message || String(e)));
    await page.addInitScript((s) => { try { localStorage.setItem("scout.session.v2", JSON.stringify(s)); } catch {} }, session);
    await page.goto(URL, { waitUntil: "load", timeout: 20000 });
    await wait(2000);
    const txt = (await page.textContent("#root")) || "";
    // Require a neighborhood AND a meal-rail option to render, so the timeline
    // + MealSlot path is genuinely exercised (not just the page chrome).
    const ok = errors.length === 0 && /SoHo|Nolita|Store A/i.test(txt) && /Pick A|Pick B/i.test(txt);
    if (!ok) {
      console.error("✗ Review smoke FAILED");
      if (errors.length) console.error("Errors:\n  " + errors.join("\n  "));
      console.error(`#root text (${txt.length} chars): ` + txt.slice(0, 200));
      process.exitCode = 1;
    } else { console.log("✓ Review smoke passed — review screen renders the trip without crashing."); }
  } catch (e) { console.error("✗ errored:", e.message); process.exitCode = 1; }
  finally { if (browser) await browser.close(); preview.kill("SIGTERM"); }
}
main();
