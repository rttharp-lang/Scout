// Getting a board OUT of Scout Mood and into a design team's own boards
// (Figma, Miro, InDesign, Keynote, print): a zip of the images + credits +
// brief, the brief as Markdown on the clipboard, and per-image downloads.
// Images are fetched through /api/mood/image (same-origin, allow-listed), which
// also performs Unsplash's required download tracking.
import { zip } from "fflate";

export const imageProxyUrl = (pin, name) => {
  const p = new URLSearchParams({ u: pin.full || pin.src || pin.thumb, name: name || fileBase(pin) });
  if (pin.downloadTrack) p.set("track", pin.downloadTrack);
  return `/api/mood/image?${p}`;
};

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
export const fileBase = (pin, i) => [i != null ? String(i + 1).padStart(2, "0") : null, slug(pin.storyId), pin.source, slug(String(pin.id).split(":").pop())].filter(Boolean).join("_");

// Copy as PNG (the only raster type the Async Clipboard API takes), capped at
// 4096px — Figma's limit. The ClipboardItem gets a Promise so Safari keeps
// the user-gesture (it rejects writes that happen after an await).
export async function copyImage(pin) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Copying images isn't supported in this browser — use Download.");
  const png = (async () => {
    const r = await fetch(imageProxyUrl(pin));
    if (!r.ok) throw new Error(`image ${r.status}`);
    const bmp = await createImageBitmap(await r.blob());
    const scale = Math.min(1, 4096 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/png"));
  })();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export function downloadPin(pin) {
  const a = document.createElement("a");
  a.href = imageProxyUrl(pin);
  a.rel = "noopener";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const list = (title, items) => (items?.length ? `\n## ${title}\n${items.map((x) => `- ${x}`).join("\n")}\n` : "");

export function briefMarkdown(brief, pins = []) {
  if (!brief) return "";
  const stories = (brief.stories || []).map((s) => `### ${s.name}${s.role ? ` (${s.role})` : ""}\n${s.narrative}\n\n_${(s.keywords || []).join(" · ")}_`).join("\n\n");
  const palette = (brief.palette || []).map((c) => `- ${c.name} — ${c.hex} (${c.role}${c.source ? `; ${c.source}` : ""})`).join("\n");
  const m = brief.macro || {};
  return [
    `# ${brief.title}${brief.season ? ` — ${brief.season}` : ""}`,
    brief.tagline ? `_${brief.tagline}_` : "",
    "",
    brief.concept || "",
    "",
    "## Macro view",
    m.shift ? `**The shift${m.stage ? ` (${m.stage})` : ""}.** ${m.shift}` : "",
    ...(m.drivers || []).map((d) => `- **${d.pillar}:** ${d.signal}${d.implication ? ` → ${d.implication}` : ""}`),
    m.consumer?.mindset ? `\n**The consumer${m.consumer.name ? ` — ${m.consumer.name}` : ""}.** ${m.consumer.mindset}` : "",
    m.confidence ? `_${m.confidence}_` : "",
    "",
    "## Stories",
    stories,
    "",
    palette ? `## Palette\n${palette}` : "",
    list("Materials & finishes", brief.materials),
    list("Silhouettes", brief.silhouettes),
    list("Details & trims", brief.details),
    list("Graphics", brief.graphics),
    list("References", brief.references),
    list("Avoid", brief.avoid),
    pins.length ? `\n## Image credits\n${creditsText(pins)}` : "",
  ].filter((x) => x !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function creditsText(pins) {
  return pins.map((p, i) => {
    const parts = [
      `${String(i + 1).padStart(2, "0")}. ${p.attribution || p.creator || p.sourceLabel || p.source}`,
      p.title ? `   ${p.title}${p.date ? `, ${p.date}` : ""}` : null,
      `   License: ${p.license?.label || "unknown"}${p.license?.url ? ` (${p.license.url})` : ""}`,
      `   Source: ${p.pageUrl}`,
      p.approval
        ? `   Designer-approved: ${p.approval.by}${p.approval.title ? `, ${p.approval.title}` : ""}${p.approval.note ? ` — “${p.approval.note}”` : ""}`
        : "   Status: AI-curated, not designer-reviewed",
      p.note ? `   AI curator's note: ${p.note}` : null,
    ];
    return parts.filter(Boolean).join("\n");
  }).join("\n\n");
}

// Cells starting with = + - @ (or a control char) would run as formulas in
// Excel/Sheets — titles and credits come from third parties, so neutralise them.
const csvCell = (v) => {
  let t = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};
export function creditsCsv(pins, files = []) {
  const head = ["n", "file", "story", "role", "title", "creator", "source", "source_url", "license", "license_url", "commercial_ok", "approved_by", "approved_at", "designer_note", "ai_curator_note"];
  const rows = pins.map((p, i) => [
    i + 1, files[i] || "", p.storyId || "", p.role || "", p.title || p.alt || "", p.creator || "", p.sourceLabel || p.source, p.pageUrl,
    p.license?.label || "", p.license?.url || "", p.license?.commercial === true ? "yes" : p.license?.commercial === false ? "no (reference only)" : "unknown",
    p.approval?.by || "", p.approval?.at || "", p.approval?.note || "", p.note || "",
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    return ok;
  }
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

// Build a zip in the browser: images (4 at a time) in one folder per story,
// numbered in board order, plus credits.txt / credits.csv, brief.md and
// palette.json. Reference-only images get a _REF suffix. Images that fail are
// listed in MISSING.txt rather than aborting the export.
export async function exportZip({ name, brief, pins, onProgress }) {
  const enc = new TextEncoder();
  const files = {};
  const missing = [];
  const names = [];
  const stories = brief?.stories || [];
  const folderOf = (p) => {
    const i = stories.findIndex((s) => s.id === p.storyId);
    return i >= 0 ? `${String(i + 1).padStart(2, "0")}_${slug(stories[i].name)}/` : stories.length ? "more/" : "";
  };
  let done = 0;
  const queue = pins.map((p, i) => ({ p, i }));
  const worker = async () => {
    while (queue.length) {
      const { p, i } = queue.shift();
      const base = `${fileBase(p, i)}${p.license?.code === "reference-only" ? "_REF" : ""}`;
      try {
        const r = await fetch(imageProxyUrl(p, base));
        if (!r.ok) throw new Error(String(r.status));
        const type = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
        names[i] = `${folderOf(p)}${base}.${EXT[type] || "jpg"}`;
        files[`images/${names[i]}`] = [new Uint8Array(await r.arrayBuffer()), { level: 0 }];
      } catch {
        names[i] = "";
        missing.push(`${base} — ${p.pageUrl}`);
      }
      onProgress?.(++done, pins.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, pins.length || 1) }, worker));
  files["credits.txt"] = enc.encode(`Image credits & licenses — ${name}\n\n${creditsText(pins)}\n`);
  files["credits.csv"] = enc.encode(creditsCsv(pins, names.map((n) => (n ? `images/${n}` : ""))));
  if (brief) {
    files["brief.md"] = enc.encode(briefMarkdown(brief));
    files["palette.json"] = enc.encode(JSON.stringify((brief.palette || []).map(({ name: n, hex, role, source }) => ({ name: n, hex, role, source })), null, 2));
  }
  if (missing.length) files["MISSING.txt"] = enc.encode(`These images could not be downloaded — open the source pages:\n\n${missing.join("\n")}\n`);
  const data = await new Promise((resolve, reject) => zip(files, (err, out) => (err ? reject(err) : resolve(out))));
  const url = URL.createObjectURL(new Blob([data], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(name) || "scout-mood"}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { missing: missing.length };
}
