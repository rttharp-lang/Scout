// Home Court smoke test: serve the production build, open /nba/ in a real
// browser at phone and desktop widths, walk every route (overview, a published
// market, league, calendar, opportunities, compare, method, agents), and fail on
// uncaught errors, missing content or horizontal page overflow. It also guards
// the October 2026 corrections (Portland's closed Nike store, the Knicks' 1973
// clincher), checks that next season's moments never show as this month's, and
// exercises search, filters, compare, section links and the print brief.
// Uses the published research in src/nba/data.
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
const hasLeague = fs.existsSync(new URL("../src/nba/data/league.json", import.meta.url));
const SHOTS = process.env.HC_SHOTS; // optional dir for screenshots

// Facts that were wrong once and must stay fixed in the published data.
function dataRegressions() {
  const out = [];
  const dir = new URL("../src/nba/data/markets/", import.meta.url);
  const text = (id) => fs.readFileSync(new URL(`${id}.json`, dir), "utf8");
  // The brief and dossiers only: the evidence log and fact-check quote the old text on purpose.
  const advice = (id) => { const m = JSON.parse(text(id)); return JSON.stringify([m.strategy, m.dossiers]); };
  const forbidden = [
    ["por", /Nike Community Store, NE MLK Jr\. Blvd/, "Portland still lists the closed NE MLK Nike store as a door"],
    ["por", /debut door for every Portland-specific drop/, "Portland's playbook still sends launches to a debut door that closed"],
    ["por", /launch(?:es|ed)? at the (?:NE MLK |MLK )?(?:Nike )?Community Store/i, "Portland still launches at the closed Community Store"],
    ["nyk", /1973 at the Garden|Game 5 at the Garden/, "New York still puts the 1973 clincher at the Garden"],
    ["phx", /Oct 30 Cup opener vs\.? Dallas|Mavericks at Suns on Oct 30/, "Phoenix still opens the Cup against Dallas on Oct 30 (it's Denver)"],
    ["dal", /Oct 30 at Phoenix/, "Dallas still opens the Cup at Phoenix on Oct 30 (it's home vs. Houston)"],
    ["uta", /Oct 30 (?:home )?Cup night against Denver|confirmed Fri Oct 30 game against Denver/, "Utah still has an Oct 30 home Cup game (it doesn't play that night)"],
    ["phi", /Spectrum is (?:the building )?where Dr\. J and Moses won/, "Philadelphia still puts the 1983 clincher at the Spectrum"],
  ];
  for (const [id, re, msg] of forbidden) if (re.test(advice(id))) out.push(msg);
  const nyk = JSON.parse(text("nyk"));
  if (!/Forum/.test(nyk.strategy.topInsights.map((t) => t.insight).join(" "))) out.push("New York's brief lost the Forum correction");
  const review = JSON.parse(fs.readFileSync(new URL("../src/nba/data/review.json", import.meta.url), "utf8"));
  for (const id of ["por-nike-community-store", "nyk-1973-clincher"]) if (!review.corrections.some((c) => c.id === id)) out.push(`corrections log is missing ${id}`);
  // Every calendar entry carries a real year, and Chicago's 2027-28 opener sits in October 2027.
  for (const m of summary.filter((x) => x.status === "complete")) {
    for (const c of m.calendar) if (!c.timing || !/^20\d\d-\d\d/.test(c.timing.start)) out.push(`${m.id}: calendar entry without a dated start (${c.window})`);
    for (const o of m.opportunities) if (o.handoff && o.handoff.status !== "hypothesis") out.push(`${m.id}/${o.id}: status ${o.handoff.status} without a named owner`);
  }
  const chi = summary.find((x) => x.id === "chi");
  const opener = chi && chi.calendar.find((c) => /2027-28 home opener/.test(c.window));
  if (opener && !opener.timing.start.startsWith("2027-10")) out.push(`Chicago's 2027-28 opener is dated ${opener.timing.start}, not October 2027`);
  // Unmeasured segment sizes are not published.
  for (const id of published) if (/"share":/.test(text(id))) out.push(`${id}: fan segment sizes are still published`);
  return out;
}

async function main() {
  const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  let browser;
  const problems = dataRegressions();
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await wait(300); }
    browser = await chromium.launch({ headless: true, executablePath: findChromium() });
    const market = published.includes("por") ? "por" : published[0];
    const routes = [
      ["overview", "#/", /NBA\s*Fandom[\s\S]*moments[\s\S]*The markets/i],
      ["league", "#/league", hasLeague ? /Themes[\s\S]*Fan types[\s\S]*Scores[\s\S]*Top opportunities/i : /league read isn/i],
      ["calendar", "#/calendar", /League\s*calendar[\s\S]*Who peaks when[\s\S]*October/i],
      ["opportunities", "#/opportunities", /Opportunity\s*board/i],
      ["compare", "#/compare", /Opportunity\s*board[\s\S]*Compare ideas[\s\S]*The pick/i],
      ["agents", "#/agents", /Fifteen agents[\s\S]*Method[\s\S]*Known gaps/i],
      ["method", "#/method", /Method[\s\S]*Evidence[\s\S]*Scores[\s\S]*Corrections[\s\S]*Known gaps/i],
      ...(market ? [["market", `#/m/${market}`, /What to know[\s\S]*Opportunities[\s\S]*Product[\s\S]*Evidence/i]] : []),
      ...(published.includes("det") ? [["market-det", "#/m/det", /What to know/i]] : []),
      ...(published.includes("nyk") ? [["market-nyk", "#/m/nyk", /What to know/i]] : []),
      ["pending-or-unknown", "#/m/zzz", /can.t find that market/i],
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
        // Open every disclosure: long titles and tables must still fit.
        await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
        await wait(300);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (wide > 1) problems.push(`[${vp.label}] market with every section open scrolls horizontally by ${wide}px`);
        // The corrections log under Evidence quotes the old text; everything else must be clean.
        const advice = await page.evaluate(() => [...document.querySelectorAll("main section")].filter((x) => x.id !== "review").map((x) => x.textContent).join(" "));
        if (market === "por" && /Nike Community Store, NE MLK|debut door for every Portland-specific drop|launch(?:es)? at the (?:NE MLK )?(?:Nike )?Community Store/i.test(advice)) problems.push(`[${vp.label}] Portland page still recommends the closed NE MLK store`);
        // Section links scroll to their section.
        if (vp.label === "desktop") {
          await page.locator(".hc-subnav a", { hasText: "Evidence" }).click();
          await wait(900);
          const top = await page.evaluate(() => document.getElementById("review").getBoundingClientRect().top);
          if (top < -5 || top > 400) problems.push(`[${vp.label}] the Evidence link didn't scroll to its section (top ${Math.round(top)})`);
        }
        // Print brief: only the executive brief prints.
        await page.evaluate(() => document.body.classList.add("hc-printing-brief"));
        await page.emulateMedia({ media: "print" });
        const shown = await page.evaluate(() => ["brief", "opportunities", "review"].map((id) => getComputedStyle(document.getElementById(id)).display));
        if (shown[0] === "none" || shown[1] !== "none" || shown[2] !== "none") problems.push(`[${vp.label}] print brief shows brief/opportunities/evidence as ${shown.join("/")}`);
        await page.emulateMedia({ media: "screen" });
        await page.evaluate(() => document.body.classList.remove("hc-printing-brief"));
      }
      // This month never shows next season's moments.
      await page.goto(BASE + "#/", { waitUntil: "load" });
      await wait(700);
      const ym = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
      const later = summary.filter((x) => x.status === "complete").flatMap((m) => m.calendar).filter((c) => c.timing && c.timing.start.slice(0, 7) > ym && (c.timing.end || c.timing.start).slice(0, 7) > ym && c.timing.start.slice(5, 7) === ym.slice(5, 7)).map((c) => c.moment);
      const monthText = (await page.locator("section", { hasText: "across the league" }).first().textContent()) || "";
      // The front page carries no research-status counts or internal labels.
      const front = (await page.textContent("#root")) || "";
      for (const bad of [/claims still unverified/i, /Date (confirmed|tentative|unknown)/i, /\bP[123]\b/, /Research status/i, /Three reads/i, /Home Court/, /Shared reviewed build/i, /\((executable this season|build for 20\d\d-\d\d)\)/i]) if (bad.test(front)) problems.push(`[${vp.label}] front page still shows ${bad}`);
      const momentTeams = await page.locator(".hc-moment-team").allTextContents();
      if (momentTeams.length && new Set(momentTeams).size !== momentTeams.length) problems.push(`[${vp.label}] a market appears twice in this month's moments`);
      if ((await page.locator(".hc-wall-tile").count()) !== 30) problems.push(`[${vp.label}] market wall doesn't show 30 tiles`);
      const leaked = later.filter((mo) => monthText.includes(mo));
      if (leaked.length) problems.push(`[${vp.label}] this month shows later-year moments: ${leaked.slice(0, 3).join(" | ")}`);
      // The front page has no search box; a team tile opens its market.
      if (await page.getByLabel("Find a team or city").count()) problems.push(`[${vp.label}] front page still shows team search`);
      const title = await page.locator(".hc-home-title").evaluate((h) => ({ text: h.textContent, over: h.scrollWidth - h.clientWidth }));
      if (title.text !== "NBA Fandom" || title.over > 1) problems.push(`[${vp.label}] front title is "${title.text}" and overflows by ${title.over}px`);
      // Every nav item is on screen; nothing hides behind a sideways scroll.
      const navHidden = await page.locator(".hc-nav a").evaluateAll((as) => as.filter((x) => x.getBoundingClientRect().right > innerWidth + 1).map((x) => x.textContent));
      if (navHidden.length) problems.push(`[${vp.label}] nav items off screen: ${navHidden.join(", ")}`);
      const navItems = (await page.locator(".hc-nav a").allTextContents()).join(" | ");
      if (navItems !== "Markets | Opportunities | Calendar | Agents") problems.push(`[${vp.label}] nav is "${navItems}"`);
      await page.locator('.hc-wall-tile[href="#/m/det"]').click();
      await wait(700);
      if (!/#\/m\/det/.test(page.url())) problems.push(`[${vp.label}] Detroit tile went to ${page.url()}`);
      // Old links still land: #/league on Compare's league read, #/method/<x> on Agents' method.
      for (const [hash, id] of [["#/compare", "compare-ideas"], ["#/method/evidence", "evidence"]]) {
        await page.goto(BASE + hash, { waitUntil: "load" });
        await wait(1200);
        const top = await page.evaluate((x) => document.getElementById(x)?.getBoundingClientRect().top, id);
        if (top == null || Math.abs(top) > 120) problems.push(`[${vp.label}] ${hash} didn't scroll to #${id} (top ${top})`);
      }
      // Calendar: the season switch moves next season's moments out of this season.
      await page.goto(BASE + "#/calendar", { waitUntil: "load" });
      await wait(700);
      const seasons = await page.locator("[aria-label=Season] button").count();
      if (seasons < 1) problems.push(`[${vp.label}] calendar has no season selector`);
      // The year chart picks a month in place; the panel follows.
      const cols = await page.locator(".hc-chart [role=button]").count();
      if (cols !== 12) problems.push(`[${vp.label}] calendar chart has ${cols} month buttons, expected 12`);
      const mname = async () => ((await page.locator(".hc-cal-mname").textContent()) || "").trim();
      await page.locator(".hc-chart [aria-label^='December']").click();
      await wait(300);
      const decLabel = (await page.locator(".hc-chart [aria-label^='December']").getAttribute("aria-label")) || "";
      const decPeaks = Number((decLabel.match(/(\d+) team/) || [])[1]);
      const decChips = await page.locator(".hc-cal-panel .hc-team-chip").count();
      if ((await mname()) !== "December" || !/#\/calendar\/all\/12$/.test(page.url())) problems.push(`[${vp.label}] tapping December showed "${await mname()}" at ${page.url()}`);
      if (decPeaks && decChips !== decPeaks) problems.push(`[${vp.label}] December says ${decPeaks} teams at peak but shows ${decChips}`);
      // Pick a team: same month, its own chart; step to the next month; open a moment.
      await page.getByLabel("Team", { exact: true }).selectOption("mem");
      await wait(700);
      if (!/#\/calendar\/mem\/12$/.test(page.url()) || (await mname()) !== "December") problems.push(`[${vp.label}] picking Memphis didn't keep December (${page.url()}, "${await mname()}")`);
      await page.getByRole("button", { name: /^Next month/ }).click();
      await wait(300);
      if ((await mname()) !== "January") problems.push(`[${vp.label}] next month went to "${await mname()}"`);
      const titles = await page.locator(".hc-mo-title").allTextContents();
      const long = titles.filter((t) => t.replace(" (key moment)", "").length > 57);
      if (long.length) problems.push(`[${vp.label}] calendar headlines too long: ${long.join(" | ")}`);
      if (titles.length) {
        await page.locator(".hc-mo summary").first().click();
        await wait(200);
        if (!(await page.locator(".hc-mo[open] .hc-mo-more").isVisible())) problems.push(`[${vp.label}] tapping a moment didn't open its play`);
      }
      await page.goto(BASE + "#/calendar/mem/month/7", { waitUntil: "load" });
      await wait(500);
      if ((await mname()) !== "July") problems.push(`[${vp.label}] old month link opened "${await mname()}"`);
      // Board: the full view filters by route and target season.
      await page.goto(BASE + "#/opportunities", { waitUntil: "load" });
      await wait(700);
      await page.getByRole("button", { name: "Full board and filters" }).click();
      await wait(300);
      const before = (await page.locator("[role=status]").textContent()) || "";
      await page.getByLabel("Target season").selectOption("2027-28");
      await wait(300);
      const after = (await page.locator("[role=status]").textContent()) || "";
      if (before === after && summary.some((m) => (m.opportunities || []).some((o) => o.handoff))) problems.push(`[${vp.label}] target-season filter didn't change the board (${before})`);
      // Compare ideas: add a third idea from the board, then weigh by a goal.
      {
        const add = page.getByRole("button", { name: "+ Compare" }).first();
        await add.click();
        await wait(300);
        const cards = await page.locator("#compare-ideas article").count();
        if (cards !== 3) problems.push(`[${vp.label}] compare ideas shows ${cards} ideas after adding a third`);
        await page.locator("#compare-ideas").getByRole("button", { name: "Biggest result" }).click();
        await wait(200);
        const pickText = (await page.locator("#compare-ideas .hc-card-invert").textContent()) || "";
        if (!/Biggest result · the pick/i.test(pickText)) problems.push(`[${vp.label}] compare ideas didn't name a pick for Biggest result`);
      }
      if (errors.length) problems.push(`[${vp.label}] page errors: ${errors.join("; ")}`);
      await page.close();
    }
    if (problems.length) { console.error("✗ NBA Fandom smoke FAILED\n  " + problems.join("\n  ")); process.exitCode = 1; }
    else console.log(`✓ NBA Fandom smoke passed — ${published.length} published market(s), all routes render at phone + desktop with no errors or overflow.`);
  } catch (e) {
    console.error("✗ NBA Fandom smoke errored:", e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    preview.kill("SIGTERM");
  }
}
main();
