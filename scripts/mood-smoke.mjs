// Scout Mood smoke test: serve the production build, open /moodboard/ in a
// real browser with every /api/mood/* call and every image host intercepted
// (no live AI, no image APIs), and walk the core flow at phone and desktop
// widths: compose a direction → brief + stories + palette → curated masonry →
// story filter → closeup → "More like this" → Save to a new board → board
// page. Fails on page errors, missing UI, or horizontal page scroll.
//
// Run with:  npm run smoke:mood   (builds first)
//   SCREENSHOTS=dir node scripts/mood-smoke.mjs   to also save screenshots
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try { for (const d of fs.readdirSync(base)) { if (d.startsWith("chromium-") && !d.includes("headless")) { const p = path.join(base, d, "chrome-linux", "chrome"); if (fs.existsSync(p)) return p; } } } catch {}
  return undefined;
}
const PORT = 4176, URL = `http://localhost:${PORT}/moodboard/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.SCREENSHOTS || "";

// ── Mock data ───────────────────────────────────────────────────────────────
const brief = {
  title: "Night Shift", season: "SP28", tagline: "Running clubs own the city after dark.",
  concept: "The city at 2am belongs to the clubs: reflective, wet, communal. Technical pieces that read quiet by day and glow under sodium light.",
  macro: {
    shift: "Running has become the new nightlife.",
    drivers: [{ pillar: "Society", signal: "Night-run crews in Lagos and Tokyo", implication: "Visibility as style" }, { pillar: "Technology", signal: "Reflective inks in streetwear", implication: "Print that glows" }, { pillar: "Creativity", signal: "Club zines and crew numerals", implication: "Graphic identity" }],
    consumer: { name: "The Night Crew", mindset: "Urban runners who treat the club run as their social life." }, stage: "growing", confidence: "Crews are evidenced; the nightlife framing is a provocation.",
  },
  stories: [
    { id: "sodium-glow", name: "Sodium Glow", role: "anchor", narrative: "Wet asphalt and amber streetlight.", keywords: ["amber", "wet", "reflective", "night"], queries: { photo: ["wet asphalt night", "sodium streetlight", "night runners"], archive: ["reflective safety vest", "lantern textile"] } },
    { id: "club-uniform", name: "Club Uniform", role: "directional", narrative: "Crew identity through colour blocks.", keywords: ["crew", "uniform", "block"], queries: { photo: ["running club group", "track jacket detail", "numbers bib"], archive: ["sports uniform 1970s", "team jersey"] } },
    { id: "quiet-tech", name: "Quiet Tech", role: "edge", narrative: "Bonded seams, matte shells.", keywords: ["matte", "bonded", "nylon"], queries: { photo: ["nylon texture macro", "bonded seam", "rain shell"], archive: ["oilskin coat", "rain cape"] } },
  ],
  palette: [
    { name: "Sodium Amber", hex: "#D98C2B", role: "accent", source: "streetlight on wet road" }, { name: "Wet Asphalt", hex: "#2B2D30", role: "core", source: "rain-dark tarmac" },
    { name: "Signal Lime", hex: "#B7F23A", role: "accent" }, { name: "Fog Grey", hex: "#B9BCBF", role: "neutral" }, { name: "Night Navy", hex: "#141B2D", role: "core" },
  ],
  materials: ["bonded ripstop", "reflective print", "brushed back jersey"], silhouettes: ["cropped shell", "wide track pant"],
  details: ["laser-cut vents", "taped seams"], graphics: ["crew numerals"], references: ["Wong Kar-wai night scenes"], avoid: ["neon cyberpunk", "gym-bro gloss"],
};
const HOSTS = ["images.unsplash.com", "images.pexels.com", "images.metmuseum.org", "openaccess-cdn.clevelandart.org"];
const SIZES = [[4000, 5000], [6000, 4000], [3000, 4500], [4000, 4000], [2400, 3600], [5000, 3333]];
let seq = 0;
function candidate(storyId, q, i) {
  const n = seq++;
  const host = HOSTS[n % HOSTS.length];
  const [w, h] = SIZES[n % SIZES.length];
  const source = ["unsplash", "pexels", "met", "cma"][n % 4];
  const known = source !== "met";
  return {
    id: `${source}:mock${n}`, source, sourceLabel: { unsplash: "Unsplash", pexels: "Pexels", met: "The Met", cma: "Cleveland Museum of Art" }[source],
    sourceHome: "https://example.org", thumb: `https://${host}/mock/${n}.svg?w=${w}&h=${h}`, src: `https://${host}/mock/${n}.svg?w=${w}&h=${h}&big=1`, full: `https://${host}/mock/${n}.svg?w=${w}&h=${h}&full=1`,
    width: known ? w : null, height: known ? h : null, color: "#888888", alt: `${q} ${i}`, title: source === "met" ? `Object ${n}` : null, date: null,
    creator: `Creator ${n}`, creatorUrl: null, pageUrl: `https://example.org/${n}`,
    license: { code: "cc0", label: "Public domain (CC0)", commercial: true, url: null }, attribution: `Photo by Creator ${n}`, downloadTrack: null,
    query: q, storyId,
  };
}
function svg(url) {
  const u = new globalThis.URL(url);
  const w = Number(u.searchParams.get("w")) || 400, h = Number(u.searchParams.get("h")) || 500;
  const hue = (parseInt(u.pathname.replace(/\D/g, ""), 10) || 0) * 47 % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w / 10)}" height="${Math.round(h / 10)}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="hsl(${hue},45%,45%)"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="hsl(${(hue + 40) % 360},60%,70%)"/></svg>`;
}

async function mockRoutes(page, calls) {
  await page.route("**/api/mood/brief", async (route) => {
    calls.brief++;
    const body = route.request().postDataJSON();
    if (!body?.direction) return route.fulfill({ status: 400, json: { error: "no-direction" } });
    await wait(300);
    return route.fulfill({ json: { brief: { ...brief, title: body.refine ? "Night Shift II" : brief.title } } });
  });
  await page.route("**/api/mood/search", async (route) => {
    calls.search++;
    const { queries } = route.request().postDataJSON();
    const candidates = queries.flatMap((q) => Array.from({ length: 5 }, (_, i) => candidate(q.storyId, q.q, i)));
    await wait(150);
    return route.fulfill({ json: { candidates, sources: { unsplash: "ok", pexels: "ok", met: "ok", cma: "ok" } } });
  });
  await page.route("**/api/mood/curate", async (route) => {
    calls.curate++;
    const { candidates, keep } = route.request().postDataJSON();
    await wait(250);
    const picks = candidates.slice(0, Math.min(keep, 6)).map((c, i) => ({ id: c.id, score: 92 - i, role: ["material", "color", "attitude", "place"][i % 4], note: `Take the ${["texture", "colour", "attitude", "light"][i % 4]} from this one.` }));
    return route.fulfill({ json: { picks, rejected: candidates.slice(8).map((c) => ({ id: c.id, reason: "below the bar" })) } });
  });
  for (const host of HOSTS) {
    await page.route(`https://${host}/**`, (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg(route.request().url()) }));
  }
  // Fonts etc. from the network aren't reachable in CI containers — fail fast.
  await page.route(/fontshare\.com/, (route) => route.abort());
}

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function run(browser, vp, problems) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message || String(e)));
  page.on("dialog", (d) => d.accept());
  const calls = { brief: 0, search: 0, curate: 0 };
  await mockRoutes(page, calls);
  const fail = (m) => problems.push(`[${vp.label}] ${m}`);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${vp.label}-${name}.png`), fullPage: false }); };

  await page.goto(URL, { waitUntil: "load", timeout: 20000 });
  await page.waitForSelector("text=Direct the", { timeout: 8000 }).catch(() => fail("hero didn't render"));
  if (!(await noHorizontalScroll(page))) fail("home page scrolls horizontally");
  await shot("1-home");

  // Compose + submit
  await page.fill("#direction", "Night running clubs in Tokyo and Lagos — wet streets, reflective light, community over competition.");
  await page.click("button.chip:has-text('Running')");
  await page.click("button:has-text('Build the mood board')");
  await page.waitForSelector("h1.board-title:has-text('Night Shift')", { timeout: 8000 }).catch(() => fail("brief title never rendered"));
  await page.waitForFunction(() => document.querySelectorAll(".tile img.tile-img").length >= 20, null, { timeout: 12000 }).catch(() => fail("fewer than 20 curated tiles rendered"));
  await page.waitForFunction(() => !document.querySelector(".skeleton"), null, { timeout: 8000 }).catch(() => fail("skeletons never cleared"));
  // Phones show the macro view collapsed; expand it like a user would.
  const toggle = await page.$("button.brief-toggle:has-text('Show the macro view')");
  if (toggle) await toggle.click();
  const txt = await page.textContent("main");
  for (const want of ["Sodium Glow", "Club Uniform", "Quiet Tech", "Sodium Amber", "The shift", "The Night Crew", "Technology.", "Request designer review"]) {
    if (!txt.includes(want)) fail(`board is missing "${want}"`);
  }
  if (calls.brief !== 1 || calls.search !== 3 || calls.curate !== 6) fail(`unexpected API call counts ${JSON.stringify(calls)}`);
  if (!(await noHorizontalScroll(page))) fail("board page scrolls horizontally");
  const cols = await page.$eval(".masonry", (m) => Number(m.dataset.cols));
  if (vp.label === "phone" && cols !== 2) fail(`phone masonry should have 2 columns, has ${cols}`);
  if (vp.label === "desktop" && cols < 4) fail(`desktop masonry should have ≥4 columns, has ${cols}`);
  // One section per story, each with its own masonry, in brief order.
  const heads = await page.$$eval(".story-section h2", (h) => h.map((x) => x.textContent));
  if (heads.length !== 3 || !/anchor/i.test(heads[0]) || !/Sodium Glow/.test(heads[0])) fail(`story sections wrong: ${JSON.stringify(heads)}`);
  // Masonry must never overlap tiles.
  const overlap = await page.$$eval(".story-section:first-of-type .masonry-item", (els) => {
    const r = els.map((e) => e.getBoundingClientRect());
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      if (r[i].left < r[j].right - 1 && r[j].left < r[i].right - 1 && r[i].top < r[j].bottom - 1 && r[j].top < r[i].bottom - 1) return true;
    }
    return false;
  });
  if (overlap) fail("masonry tiles overlap");
  await shot("2-board");

  // Story filter shows just that section
  await page.click(".story-bar button.chip:has-text('Quiet Tech')");
  const sectionsShown = await page.$$eval(".story-section", (s) => s.length);
  const storyTiles = await page.$$eval(".masonry .tile", (t) => t.length);
  if (sectionsShown !== 1 || storyTiles < 4 || storyTiles > 12) fail(`story filter shows ${sectionsShown} sections / ${storyTiles} tiles`);
  await page.click(".story-bar button.chip:has-text('All')");

  // "Not this" by keyboard (X on the focused tile), then Undo
  const before = await page.$$eval(".masonry .tile", (t) => t.length);
  await page.focus(".masonry .tile-open >> nth=1");
  await page.keyboard.press("x");
  await page.waitForSelector(".toast:has-text('Removed from the board')", { timeout: 3000 }).catch(() => fail("X didn't remove the tile"));
  const afterHide = await page.$$eval(".masonry .tile", (t) => t.length);
  if (afterHide !== before - 1) fail(`hide removed ${before - afterHide} tiles`);
  await page.click(".toast button:has-text('Undo')");
  await page.waitForFunction((n) => document.querySelectorAll(".masonry .tile").length === n, before, { timeout: 3000 }).catch(() => fail("Undo didn't restore the tile"));

  // Closeup + More like this
  await page.click(".masonry .tile-open >> nth=0");
  await page.waitForSelector(".modal .closeup-note", { timeout: 5000 }).catch(() => fail("closeup didn't open"));
  const cutxt = await page.textContent(".modal");
  if (!/AI-curated/.test(cutxt)) fail("closeup is missing the honest AI-curated label");
  if (!/AI curator's note/.test(cutxt)) fail("closeup doesn't attribute the note to the AI curator");
  if (!/Public domain|License/i.test(cutxt)) fail("closeup is missing the license");
  await shot("3-closeup");
  await page.click(".modal button:has-text('More like this')");
  await page.waitForFunction(() => document.querySelectorAll(".related .tile").length >= 4, null, { timeout: 8000 }).catch(() => fail("More like this produced no tiles"));

  // First Save (no boards yet) → picker → create a board → Done
  await page.click(".modal .closeup-actions button:has-text('Save')");
  await page.waitForSelector(".popover[aria-label='Save to boards']", { timeout: 3000 }).catch(() => fail("board picker didn't open"));
  await page.fill(".popover input", "SP28 Final");
  await page.click(".popover button:has-text('Create')");
  await page.waitForSelector(".toast:has-text('Saved to SP28 Final')", { timeout: 3000 }).catch(() => fail("save toast missing"));
  await page.waitForSelector(".popover [role='checkbox'][aria-checked='true']", { timeout: 2000 }).catch(() => fail("picker doesn't show the new board as checked"));
  await page.click(".popover button:has-text('Done')");
  await page.waitForSelector(".popover", { state: "detached", timeout: 2000 }).catch(() => fail("Done didn't close the picker"));
  // Browser back closes the closeup (it owns one history entry), board stays.
  await page.goBack();
  await page.waitForSelector(".modal", { state: "detached", timeout: 3000 }).catch(() => fail("Back didn't close the closeup"));
  if (!(await page.$("h1.board-title:has-text('Night Shift')"))) fail("Back left the board instead of closing the closeup");

  // Second Save is one click to the last-used board
  await page.hover(".masonry .tile >> nth=2");
  await page.click(".masonry .tile >> nth=2 >> .tile-save:not(.tile-save-caret)");
  await page.waitForSelector(".toast:has-text('Saved to SP28 Final')", { timeout: 3000 }).catch(() => fail("quick save didn't go to the last board"));
  if (await page.$(".popover")) fail("quick save opened the picker");

  // Save all as board, then visit Boards
  await page.click("button:has-text('Save as board')");
  await page.click("a.mood-navlink:has-text('Boards')");
  await page.waitForSelector("h1.board-title:has-text('Boards')", { timeout: 4000 }).catch(() => fail("boards page didn't render"));
  const boardsTxt = await page.textContent("main");
  if (!boardsTxt.includes("SP28 Final") || !boardsTxt.includes("Night Shift")) fail("boards page is missing the saved boards");
  await shot("4-boards");
  await page.click(".cover:has-text('SP28 Final')");
  await page.waitForSelector("h1.board-title:has-text('SP28 Final')", { timeout: 4000 }).catch(() => fail("saved board didn't open"));
  const pins = await page.$$eval(".masonry .tile", (t) => t.length);
  if (pins !== 2) fail(`saved board should have 2 pins, has ${pins}`);

  // Persistence across reload
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("h1.board-title:has-text('SP28 Final')", { timeout: 4000 }).catch(() => fail("board didn't survive a reload"));
  if ((await page.$$eval(".masonry .tile", (t) => t.length)) !== 2) fail("board lost pins across a reload");

  // Error path: brief failure shows a retry, never a blank page.
  await page.unroute("**/api/mood/brief");
  await page.route("**/api/mood/brief", (route) => route.fulfill({ status: 503, json: { error: "ai-not-configured" } }));
  await page.goto(URL, { waitUntil: "load" });
  await page.fill("#direction", "Arctic archive for the city.");
  await page.click("button:has-text('Build the mood board')");
  await page.waitForSelector("text=ANTHROPIC_API_KEY", { timeout: 5000 }).catch(() => fail("AI-not-configured error not explained"));
  await page.waitForSelector("button:has-text('Try again')", { timeout: 3000 }).catch(() => fail("no retry after a failed brief"));

  if (errors.length) fail(`page errors: ${errors.join("; ")}`);
  await page.close();
}

async function main() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  let browser;
  const problems = [];
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch {} await wait(300); }
    browser = await chromium.launch({ headless: true, executablePath: findChromium() });
    for (const vp of [{ width: 390, height: 844, label: "phone" }, { width: 1440, height: 900, label: "desktop" }]) {
      await run(browser, vp, problems);
    }
  } catch (e) {
    problems.push(`errored: ${e.message}`);
  } finally {
    if (browser) await browser.close();
    preview.kill("SIGTERM");
  }
  if (problems.length) {
    console.error("✗ Mood smoke FAILED\n  " + problems.join("\n  "));
    process.exitCode = 1;
  } else {
    console.log("✓ Mood smoke passed — compose → brief → story sections → filter → not-this/undo → closeup → more like this → save (picker + one-click) → boards → reload, at phone and desktop widths.");
  }
}
main();
