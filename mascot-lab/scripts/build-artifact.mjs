// Turns the single-file build (dist-artifact/index.html, produced by
// `vite build --mode artifact`) into a claude.ai Artifact page.
//
// The Artifact host wraps the page in its own <!doctype><html><head><body>
// skeleton, so the page must be bare content: <title> and <style> first, then
// markup, then scripts. Everything (JS, CSS, fonts, sample logos) is already
// inlined by vite-plugin-singlefile.
//
//   npm run build:artifact   →   dist-artifact/mascot-lab.html
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("dist-artifact");
const src = fs.readFileSync(path.join(dir, "index.html"), "utf8");

const pick = (re) => [...src.matchAll(re)].map((m) => m[0]);
const title = (src.match(/<title>[\s\S]*?<\/title>/i) || ["<title>Mascot Lab</title>"])[0];
const styles = pick(/<style\b[^>]*>[\s\S]*?<\/style>/gi);
const scripts = pick(/<script\b[^>]*>[\s\S]*?<\/script>/gi);
const bodyMatch = src.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
if (!bodyMatch) throw new Error("dist-artifact/index.html has no <body>");
// Body markup minus any scripts (they are re-appended at the end).
const body = bodyMatch[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").trim();

const out = [
  title,
  ...styles,
  body,
  // Module scripts are deferred, so they run after #root exists either way.
  ...scripts,
].join("\n");

const outFile = path.join(dir, "mascot-lab.html");
fs.writeFileSync(outFile, out);
const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log(`artifact page → ${path.relative(process.cwd(), outFile)} (${kb} KB)`);
if (fs.statSync(outFile).size > 15.5 * 1024 * 1024) {
  console.error("too large for an Artifact page (16MB limit)");
  process.exit(1);
}
