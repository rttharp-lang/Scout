// Getting a board OUT of Scout Mood and into a design team's own boards
// (Figma, Miro, InDesign, Keynote, print): a zip of the images + credits +
// brief, the brief as Markdown on the clipboard, and per-image downloads.
// Images are fetched through /api/mood-image (same-origin, allow-listed), which
// also performs Unsplash's required download tracking.
import { zip } from "fflate";

export const imageProxyUrl = (pin, name) => {
  const p = new URLSearchParams({ u: pin.full || pin.src || pin.thumb, name: name || fileBase(pin) });
  if (pin.downloadTrack) p.set("track", pin.downloadTrack);
  return `/api/mood-image?${p}`;
};

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
export const fileBase = (pin, i) => [i != null ? String(i + 1).padStart(2, "0") : null, slug(pin.storyId), pin.source, slug(String(pin.id).split(":").pop())].filter(Boolean).join("_");

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
      p.approval ? `   Designer-approved: ${p.approval.by}${p.approval.title ? `, ${p.approval.title}` : ""}` : null,
      p.note ? `   Curator's note: ${p.note}` : null,
    ];
    return parts.filter(Boolean).join("\n");
  }).join("\n\n");
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

// Build a zip in the browser: images (4 at a time), credits.txt, brief.md.
// Images that fail are listed in MISSING.txt rather than aborting the export.
export async function exportZip({ name, brief, pins, onProgress }) {
  const enc = new TextEncoder();
  const files = {};
  const missing = [];
  let done = 0;
  const queue = pins.map((p, i) => ({ p, i }));
  const worker = async () => {
    while (queue.length) {
      const { p, i } = queue.shift();
      try {
        const r = await fetch(imageProxyUrl(p, fileBase(p, i)));
        if (!r.ok) throw new Error(String(r.status));
        const type = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
        files[`images/${fileBase(p, i)}.${EXT[type] || "jpg"}`] = [new Uint8Array(await r.arrayBuffer()), { level: 0 }];
      } catch {
        missing.push(`${fileBase(p, i)} — ${p.pageUrl}`);
      }
      onProgress?.(++done, pins.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, pins.length || 1) }, worker));
  files["credits.txt"] = enc.encode(`Image credits & licenses — ${name}\n\n${creditsText(pins)}\n`);
  if (brief) files["brief.md"] = enc.encode(briefMarkdown(brief));
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
