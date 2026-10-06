// Mascot Lab — make an uploaded SVG safe to store, send and open.
//
// The order flow keeps an uploaded SVG logo as a VECTOR for the print shop: it goes to
// the order inbox (db) or the site's endpoint, and the owner downloads it as a .svg and
// opens it. Opened as a document (not through <img>), an SVG runs its scripts, event
// handlers, javascript: links and foreignObject HTML, and loads external resources, so
// both sides sanitize: the coach's page before sending, the owner's inbox before saving
// (a coach controls their own db document, so the owner side can't trust it). The image
// loader (image.js rasterizeSvgText) sanitizes too: a <foreignObject> in an SVG drawn to a
// canvas taints it, so an Illustrator export (foreignObject inside a <switch>) could never
// be read back otherwise.
//
//   sanitizeSvg(text) → a clean SVG string, or null when the text isn't a usable SVG.
//
// Allowlist: SVG drawing elements only (no script, foreignObject, animation, iframe…);
// `a` is unwrapped (its artwork stays, the link goes); no `on*` attributes; href only to
// "#fragment" or an embedded raster data:image; CSS (style attributes and <style>) loses
// @import, url() other than "#fragment" / embedded raster, and javascript:/expression().
// Processing instructions, comments and the DOCTYPE are dropped. Browser-only (DOMParser).

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const XML_NS = "http://www.w3.org/XML/1998/namespace";

const ALLOWED = new Set([
  "svg", "g", "defs", "symbol", "use", "switch", "title", "desc",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textpath",
  "lineargradient", "radialgradient", "stop", "pattern", "clippath", "mask", "marker", "image", "style",
  "filter", "feblend", "fecolormatrix", "fecomponenttransfer", "fecomposite", "feconvolvematrix",
  "fediffuselighting", "fedisplacementmap", "fedistantlight", "fedropshadow", "feflood",
  "fefunca", "fefuncb", "fefuncg", "fefuncr", "fegaussianblur", "feimage", "femerge", "femergenode",
  "femorphology", "feoffset", "fepointlight", "fespecularlighting", "fespotlight", "fetile", "feturbulence",
]);
const UNWRAP = new Set(["a"]);
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]*$/i;

const okHref = (v) => {
  const t = String(v || "").trim();
  return t.startsWith("#") ? /^#[\w.:-]*$/.test(t) : SAFE_DATA_IMAGE.test(t);
};

/** cleanCss(text) → CSS with external loads and script-ish constructs removed. */
export function cleanCss(text) {
  return String(text || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (m, q, u) => (okHref(u) ? m : "none"))
    .replace(/javascript\s*:/gi, "")
    .replace(/expression\s*\(/gi, "(")
    .replace(/-moz-binding|behavior\s*:/gi, "")
    .replace(/<\/?\s*[a-z!?]/gi, ""); // never let text break out of <style>
}

function cleanElement(el) {
  // children first (a static copy: the loop removes/unwraps as it goes)
  for (const child of [...el.childNodes]) {
    if (child.nodeType === 1) {
      const name = String(child.localName || "").toLowerCase();
      if (child.namespaceURI !== SVG_NS) { child.remove(); continue; }
      if (UNWRAP.has(name)) {
        cleanElement(child);
        while (child.firstChild) el.insertBefore(child.firstChild, child);
        child.remove();
        continue;
      }
      if (!ALLOWED.has(name)) { child.remove(); continue; }
      cleanElement(child);
    } else if (child.nodeType !== 3 && child.nodeType !== 4) {
      child.remove(); // comments, processing instructions (text and CDATA stay)
    }
  }
  // <style> content is CSS: clean it (elsewhere text is inert)
  if (String(el.localName).toLowerCase() === "style") el.textContent = cleanCss(el.textContent);
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    const local = String(attr.localName || "").toLowerCase();
    const value = attr.value;
    if (name.startsWith("on") || local.startsWith("on")) { el.removeAttributeNode(attr); continue; }
    if (local === "href") {
      if (!okHref(value)) el.removeAttributeNode(attr);
      continue;
    }
    if (local === "style") { el.setAttribute(attr.name, cleanCss(value)); continue; }
    // attribute values that point anywhere else (filter="url(http…)", mask, fill…)
    if (/url\s*\(/i.test(value) || /javascript\s*:/i.test(value)) {
      const cleaned = cleanCss(value);
      if (cleaned !== value) el.setAttribute(attr.name, cleaned);
    }
    // namespaced editor/foreign attributes (inkscape:, sodipodi:…) are dropped
    if (attr.namespaceURI && attr.namespaceURI !== XLINK_NS && attr.namespaceURI !== XMLNS_NS && attr.namespaceURI !== XML_NS) {
      el.removeAttributeNode(attr);
    }
  }
}

/** sanitizeSvg(text) → a safe SVG string, or null when it isn't a parseable SVG. */
export function sanitizeSvg(text) {
  if (typeof text !== "string" || !text.trim() || typeof DOMParser === "undefined") return null;
  let doc;
  try {
    doc = new DOMParser().parseFromString(text, "image/svg+xml");
  } catch {
    return null;
  }
  const svg = doc?.documentElement;
  if (!svg || svg.namespaceURI !== SVG_NS || String(svg.localName).toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
  cleanElement(svg);
  try {
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return null;
  }
}

/** svgDataUrl(text) → "data:image/svg+xml;base64,…" (UTF-8). */
export function svgDataUrl(text) {
  const bytes = new TextEncoder().encode(String(text));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/** dataUrlText(url) → the decoded text of a data: URL (base64 or percent-encoded), or null. */
export function dataUrlText(url) {
  const s = String(url || "");
  const comma = s.indexOf(",");
  if (!s.startsWith("data:") || comma < 0) return null;
  const meta = s.slice(5, comma), body = s.slice(comma + 1);
  try {
    if (/;base64/i.test(meta)) {
      const bin = atob(body.replace(/\s+/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(body);
  } catch {
    return null;
  }
}
