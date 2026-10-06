// Turns the single-file build (dist-artifact/index.html, produced by
// `vite build --mode artifact`) into a claude.ai Artifact page.
//
// The Artifact host wraps the page in its own <!doctype><html><head><body>
// skeleton, so the page must be bare content: <title> and <style> first, then
// markup, then scripts. Everything (JS, CSS, fonts, sample logos, the effect
// worker) is already inlined by vite-plugin-singlefile.
//
//   npm run build:artifact   →   dist-artifact/mascot-lab.html
//
// The input is parsed the way a browser tokenizes it: <script> and <style> are
// raw-text elements, so their CONTENT is skipped as a whole before the skeleton is
// read. (The JS bundle contains whole HTML documents as strings — the printable
// order sheet has its own <title>, <style> and <body> — and a plain regex over the
// file would pick those up instead of the page's own tags.)
//
// Dropped on purpose: <meta charset/viewport> (the host's skeleton has them),
// description/theme-color metas (meaningless inside the frame) and the
// <link rel="icon" href="./favicon.svg"> (that file is not published with the page;
// the Artifact's tab icon comes from the publish call's `icon`). <html lang="en">
// is restored by a one-line inline script, since the host's <html> carries no lang.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("dist-artifact");
const src = fs.readFileSync(path.join(dir, "index.html"), "utf8");

// 1. lift out every raw-text element, in document order, leaving a placeholder
const raw = [];
const RAW_ELEMENT = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
const skeleton = src.replace(RAW_ELEMENT, (whole, tag, attrs, body) => {
  raw.push({ tag: tag.toLowerCase(), attrs, body });
  return `\u0000${raw.length - 1}\u0000`;
});
const HOLE = /\u0000(\d+)\u0000/g;
const holes = (html) => [...html.matchAll(HOLE)].map((m) => raw[Number(m[1])]);

const fail = (msg) => {
  console.error(`build-artifact: ${msg}`);
  process.exit(1);
};

const headMatch = skeleton.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i);
const bodyMatch = skeleton.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
if (!headMatch || !bodyMatch) fail("dist-artifact/index.html has no <head> or <body>");
const head = headMatch[1];
const body = bodyMatch[1];

// 2. the pieces
const title = (head.match(/<title\b[^>]*>[\s\S]*?<\/title\s*>/i) || ["<title>Mascot Lab</title>"])[0];
const inHead = holes(head);
const inBody = holes(body);
const styles = [...inHead, ...inBody].filter((r) => r.tag === "style");
const scripts = [...inHead, ...inBody].filter((r) => r.tag === "script");
// body markup without its raw elements (styles go first, scripts last)
const markup = body.replace(HOLE, "").trim();

if (!/\bid=["']root["']/.test(markup)) fail('the page markup has no <div id="root"> (wrong <body> picked?)');
if (!styles.length) fail("no inlined <style> found");
if (!scripts.length) fail("no inlined <script> found");
// anything still pointing at a file next to the page would 404 in the frame
const leftovers = [...src.replace(RAW_ELEMENT, "").matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)]
  .map((m) => m[1])
  .filter((u) => !/^(data:|blob:|https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com)\/)/.test(u))
  .filter((u) => !/favicon/.test(u));
if (leftovers.length) fail(`external file references left in the page: ${leftovers.join(", ")}`);

// Keep a script's `type` (module scripts are deferred and run after #root exists); drop
// crossorigin/rel noise that only meant something for the separate files.
const scriptTag = (r) => {
  const type = r.attrs.match(/\btype=["']([^"']+)["']/i)?.[1];
  return `<script${type ? ` type="${type}"` : ""}>${r.body}</script>`;
};
// @fontsource faces list a WOFF fallback after the WOFF2: every browser that can run this
// page (module scripts, OffscreenCanvas) takes the WOFF2, so the inlined WOFF copy is
// ~0.5 MB of dead weight. Only a fallback that FOLLOWS a woff2 source is dropped.
let woffBytes = 0;
const dropWoffFallback = (css) =>
  css.replace(/(format\(["']?woff2["']?\))\s*,\s*url\(\s*["']?data:font\/woff;base64,[A-Za-z0-9+/=]+["']?\s*\)\s*format\(["']?woff["']?\)/g, (m, keep) => {
    woffBytes += m.length - keep.length;
    return keep;
  });
const styleTag = (r) => `<style>${dropWoffFallback(r.body)}</style>`;

const out = [
  title,
  ...styles.map(styleTag),
  markup,
  `<script>document.documentElement.lang||(document.documentElement.lang="en")</script>`,
  ...scripts.map(scriptTag),
].join("\n");

const outFile = path.join(dir, "mascot-lab.html");
fs.writeFileSync(outFile, out);
const size = fs.statSync(outFile).size;
console.log(
  `artifact page → ${path.relative(process.cwd(), outFile)} (${(size / 1024).toFixed(0)} KB; ` +
  `${styles.length} style, ${scripts.length} script, markup ${markup.length} B; ${(woffBytes / 1024).toFixed(0)} KB of WOFF fallbacks dropped)`,
);
if (/data:font\/woff;/.test(out) && !/data:font\/woff2;/.test(out)) fail("fonts lost their WOFF2 sources");
if (size > 15.5 * 1024 * 1024) fail("too large for an Artifact page (16MB limit)");
