// Smoke test: serve the production build, open it in a real browser, and fail
// if the app throws on load or doesn't render. Catches runtime crashes (e.g.
// the white-screen kind) that `vite build` can't — it only checks bundling.
//
// Run with:  npm run smoke   (builds first, then this)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// Use the Chromium pre-installed in this environment rather than downloading.
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
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

const PORT = 4173;
const URL = `http://localhost:${PORT}/`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(URL);
      if (res.ok) return true;
    } catch {}
    await wait(300);
  }
  throw new Error("preview server did not start in time");
}

async function main() {
  const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore",
  });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true, executablePath: findChromium() });
    const page = await browser.newPage();

    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message || String(e)));
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

    await page.goto(URL, { waitUntil: "load", timeout: 20000 });
    await wait(1200); // let effects run (restore, etc.)

    const rootText = (await page.textContent("#root")) || "";
    const rendered = /Scout|Where are you going/i.test(rootText);

    const problems = [];
    if (pageErrors.length) problems.push("Uncaught errors:\n  " + pageErrors.join("\n  "));
    if (!rendered) problems.push(`#root did not render expected content (got ${rootText.length} chars).`);

    if (problems.length) {
      console.error("✗ Smoke test FAILED\n" + problems.join("\n"));
      process.exitCode = 1;
    } else {
      console.log("✓ Smoke test passed — app loads and renders without errors.");
      if (consoleErrors.length) console.log(`  (note: ${consoleErrors.length} console error(s), not fatal)`);
    }
  } catch (e) {
    console.error("✗ Smoke test errored:", e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    preview.kill("SIGTERM");
  }
}

main();
