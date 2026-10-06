// Collection page — the lookbook "line sheet": a 2400 × 3000 poster composed on a
// canvas, laid out like a real apparel line sheet (team masthead, the look, every
// included piece front-and-back with style code and price, team colours, fine print).
//
// The poster is a printed artefact, not UI chrome: it always uses the same paper and
// ink whatever the site theme is, so its colours live here as constants (they mirror
// the light-theme tokens in tokens.css).

export const POSTER = { width: 2400, height: 3000 };

const PAPER = "#F5F6F8";
const INK = "#0E1116";
const INK_2 = "#4C5562";
const INK_3 = "#7A838F";
const RULE = "#C9D0D9";
const STAGE = "#E4E8ED";
const CARD = "#FAFBFC";
// effect stage backdrops, as the effect gallery paints them (CONTRACTS.md)
const STAGES = { paper: "#ECEBE6", dark: "#101216", mid: "#7D838C" };

const DISPLAY = '"Big Shoulders Display", "Archivo Narrow", "Arial Narrow", Impact, sans-serif';
const BODY = '"Archivo", "Helvetica Neue", Arial, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

export const FINE_PRINT = "Mockups are previews. Final colors and placement are confirmed on your proof.";

/** Make sure every face the poster uses is loaded (canvas text silently falls back otherwise). */
export async function posterFontsReady() {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const faces = [
    `900 120px ${DISPLAY}`, `800 120px ${DISPLAY}`,
    `500 40px ${MONO}`, `600 40px ${MONO}`,
    `400 40px ${BODY}`, `600 40px ${BODY}`,
  ];
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)));
}

/* ───────────────────────────── helpers ───────────────────────────── */

function rgb(h) { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lum(h) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(h);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function darken(h, t) { const [r, g, b] = rgb(h); const f = (v) => Math.round(v * (1 - t)).toString(16).padStart(2, "0"); return `#${f(r)}${f(g)}${f(b)}`; }

/** The first team colour that reads on paper (≥ 3:1), else ink. */
function readableOnPaper(palette) {
  for (const c of [palette.primary, palette.secondary, palette.dark]) if (c && contrast(c, PAPER) >= 3) return c;
  return INK;
}

/** Set a font, shrinking the size until `text` fits maxW. Returns the size used. */
function fitFont(ctx, text, maxW, size, weight, family, min = 12) {
  let s = size;
  for (;;) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW || s <= min) return s;
    s = Math.max(min, Math.floor(s * 0.94));
  }
}

/** Letter-spaced mono text (canvas letterSpacing where supported, else manual). */
function spaced(ctx, text, x, y, spacing, align = "left") {
  if ("letterSpacing" in ctx) {
    ctx.letterSpacing = `${spacing}px`;
    const w = ctx.measureText(text).width;
    const sx = align === "right" ? x - w + spacing : align === "center" ? x - w / 2 : x;
    ctx.textAlign = "left";
    ctx.fillText(text, sx, y);
    ctx.letterSpacing = "0px";
    return w;
  }
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  let cx = align === "right" ? x - w + spacing : align === "center" ? x - w / 2 : x;
  ctx.textAlign = "left";
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
  return w;
}

function measureSpaced(ctx, text, spacing) {
  if ("letterSpacing" in ctx) {
    ctx.letterSpacing = `${spacing}px`;
    const w = ctx.measureText(text).width;
    ctx.letterSpacing = "0px";
    return w;
  }
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w;
}

/** Truncate text with an ellipsis to fit maxW at the current font. */
function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

/** Greedy word wrap into at most maxLines lines (the last one ellipsized). */
function wrapLines(ctx, text, maxW, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= maxW || !cur) { cur = next; continue; }
    lines.push(cur);
    cur = words[i];
    if (lines.length === maxLines - 1) { cur = words.slice(i).join(" "); break; }
  }
  if (cur) lines.push(lines.length === maxLines - 1 ? ellipsize(ctx, cur, maxW) : cur);
  return lines.slice(0, maxLines);
}

/** Draw `src` (square mockup) into a box, contain. */
function drawContain(ctx, src, x, y, w, h) {
  if (!src) return;
  const k = Math.min(w / src.width, h / src.height);
  const dw = src.width * k, dh = src.height * k;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function cropMarks(ctx, x, y, w, h, len = 22, off = 12, color = INK_3) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const L = [
    [x - off - len, y, x - off, y], [x, y - off - len, x, y - off],
    [x + w + off, y, x + w + off + len, y], [x + w, y - off - len, x + w, y - off],
    [x - off - len, y + h, x - off, y + h], [x, y + h + off, x, y + h + off + len],
    [x + w + off, y + h, x + w + off + len, y + h], [x + w, y + h + off, x + w, y + h + off + len],
  ];
  ctx.beginPath();
  for (const [a, b, c, d] of L) { ctx.moveTo(a, b); ctx.lineTo(c, d); }
  ctx.stroke();
  ctx.restore();
}

function monthLabel(date) {
  try {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
  } catch {
    return String(date.getFullYear());
  }
}

/** Grid shape for n pieces. */
function gridFor(n) {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  const cols = 3;
  return { cols, rows: Math.ceil(n / cols) };
}

/* ───────────────────────────── composer ───────────────────────────── */

/**
 * composeLineSheet({ team, palette, effect, dropStyle, art, pieces, date }) → canvas (2400 × 3000).
 *   team: { school, mascot }; palette: { primary, secondary, accent, dark, light };
 *   effect: { name, method, stage }; dropStyle: { name } | null;
 *   art: the look's effect render (transparent square) for the masthead;
 *   pieces: [{ name, styleCode, spec, price, front, back }] — front/back are mockup canvases.
 */
export function composeLineSheet({ team, palette, effect, dropStyle, art, pieces, date = new Date() }) {
  const { width: W, height: H } = POSTER;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const M = 140;
  const teamInk = readableOnPaper(palette);

  // paper
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // jersey-trim stripe in the team colours (top and bottom)
  ctx.fillStyle = palette.primary; ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = palette.secondary; ctx.fillRect(0, 30, W, 12);
  ctx.fillStyle = palette.primary; ctx.fillRect(0, H - 18, W, 18);

  ctx.textBaseline = "alphabetic";

  /* ── masthead ── */
  const artSize = 440;
  const artX = W - M - artSize, artY = 150;
  const headW = artX - M - 80;

  ctx.fillStyle = INK_2;
  ctx.font = `500 30px ${MONO}`;
  spaced(ctx, `TEAM LINE SHEET  ·  ${monthLabel(date)}`, M, 196, 4.5);

  const school = String(team?.school || "").trim().toUpperCase();
  const mascot = String(team?.mascot || "").trim().toUpperCase();
  const line1 = school || mascot || "YOUR TEAM";
  const line2 = school && mascot ? mascot : "";
  ctx.fillStyle = INK;
  const s1 = fitFont(ctx, line1, headW, 236, 900, DISPLAY, 90);
  ctx.fillText(line1, M - 6, 196 + 34 + s1 * 0.8);
  let y = 196 + 34 + s1 * 0.8;
  if (line2) {
    ctx.fillStyle = teamInk;
    const s2 = fitFont(ctx, line2, headW, Math.min(236, s1), 900, DISPLAY, 90);
    y += s2 * 0.86;
    ctx.fillText(line2, M - 6, y);
  }

  // look line: effect + print method + drop style
  y += 74;
  ctx.font = `600 30px ${MONO}`;
  ctx.fillStyle = INK;
  const parts = [
    ["LOOK", (effect?.name || "Clean").toUpperCase()],
    effect?.method ? ["PRINT", effect.method.toUpperCase()] : null,
    dropStyle ? ["DROP", dropStyle.name.toUpperCase()] : null,
    ["PIECES", String(pieces.length)],
  ].filter(Boolean);
  let x = M;
  for (const [k, v] of parts) {
    ctx.font = `500 26px ${MONO}`;
    ctx.fillStyle = INK_3;
    x += spaced(ctx, k, x, y, 4) + 14;
    ctx.font = `600 30px ${MONO}`;
    ctx.fillStyle = INK;
    x += spaced(ctx, v, x, y, 3.5) + 56;
  }

  // the look on its gallery stage, with crop marks
  const stage = effect?.stage === "team" ? darken(palette.primary, 0.06) : STAGES[effect?.stage] || STAGES.paper;
  ctx.fillStyle = stage;
  ctx.fillRect(artX, artY, artSize, artSize);
  if (art) drawContain(ctx, art, artX + 10, artY + 10, artSize - 20, artSize - 20);
  cropMarks(ctx, artX, artY, artSize, artSize);
  ctx.font = `500 22px ${MONO}`;
  ctx.fillStyle = INK_3;
  spaced(ctx, "ARTWORK", artX, artY + artSize + 52, 4);
  spaced(ctx, (effect?.name || "Clean").toUpperCase(), artX + artSize, artY + artSize + 52, 4, "right");

  // heavy rule under the masthead
  const ruleY = Math.max(y + 70, artY + artSize + 100);
  ctx.fillStyle = INK;
  ctx.fillRect(M, ruleY, W - 2 * M, 6);

  /* ── footer (measured first so the grid gets what's left) ── */
  const footH = 330;
  const footY = H - 60 - footH;

  /* ── pieces grid ── */
  const gridTop = ruleY + 70;
  const gridBottom = footY - 60;
  const n = Math.max(1, pieces.length);
  const { cols, rows } = gridFor(n);
  const gapX = 64, gapY = 64;
  const colW = (W - 2 * M - (cols - 1) * gapX) / cols;
  const textH = 196;
  const img = Math.min(colW, (gridBottom - gridTop - (rows - 1) * gapY) / rows - textH);
  const rowH = img + textH;
  // when the column has room, the back sits beside the front instead of inset on it
  const besideGap = 28;
  const beside = colW - img >= img * 0.36 + besideGap;
  const backSize = beside ? Math.min(colW - img - besideGap, img * 0.48) : Math.round(img * 0.34);
  const blockW = beside ? img + besideGap + backSize : img;
  const usedH = rows * rowH + (rows - 1) * gapY;
  const top = gridTop + Math.max(0, (gridBottom - gridTop - usedH) / 2);

  pieces.forEach((p, i) => {
    const r = Math.floor(i / cols), col = i % cols;
    // centre a short last row
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const rowOffset = ((cols - inRow) * (colW + gapX)) / 2;
    const cx = M + rowOffset + col * (colW + gapX) + (colW - blockW) / 2;
    const cy = top + r * (rowH + gapY);

    // stage + front
    ctx.fillStyle = STAGE;
    ctx.fillRect(cx, cy, img, img);
    drawContain(ctx, p.front, cx + img * 0.02, cy + img * 0.02, img * 0.96, img * 0.96);

    // back: beside the front when there's room, else a small card inset bottom right
    if (p.back) {
      const b = Math.round(backSize);
      const bx = beside ? cx + img + besideGap : cx + img - b - 14;
      const by = beside ? cy + img - b : cy + img - b - 14;
      ctx.save();
      ctx.shadowColor = "rgba(14,17,22,0.18)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = CARD;
      ctx.fillRect(bx, by, b, b);
      ctx.restore();
      ctx.strokeStyle = RULE;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, b - 2, b - 2);
      drawContain(ctx, p.back, bx + b * 0.09, by + b * 0.11, b * 0.82, b * 0.82);
      ctx.font = `500 ${Math.max(14, Math.round(b * 0.07))}px ${MONO}`;
      ctx.fillStyle = INK_3;
      spaced(ctx, "BACK", bx + 12, by + 12 + Math.max(14, Math.round(b * 0.07)), 2.5);
    }
    ctx.font = `500 ${Math.max(16, Math.round(img * 0.026))}px ${MONO}`;
    ctx.fillStyle = INK_3;
    spaced(ctx, String(i + 1).padStart(2, "0"), cx + 18, cy + 18 + Math.max(16, Math.round(img * 0.026)), 2.5);

    // caption: name ........ price / code · spec
    const capW = blockW;
    const nameSize = Math.round(Math.max(40, Math.min(66, img * 0.082)));
    const ty = cy + img + nameSize + 22;
    const price = Number.isFinite(p.price) ? `$${p.price}` : "";
    ctx.fillStyle = INK;
    ctx.font = `800 ${nameSize}px ${DISPLAY}`;
    const priceW = price ? ctx.measureText(price).width : 0;
    const nm = fitFont(ctx, String(p.name || "").toUpperCase(), capW - priceW - 30, nameSize, 800, DISPLAY, 28);
    ctx.font = `800 ${nm}px ${DISPLAY}`;
    ctx.textAlign = "left";
    ctx.fillText(String(p.name || "").toUpperCase(), cx, ty);
    if (price) {
      ctx.font = `800 ${nameSize}px ${DISPLAY}`;
      ctx.textAlign = "right";
      ctx.fillText(price, cx + capW, ty);
      ctx.textAlign = "left";
    }
    const metaSize = Math.round(Math.max(20, Math.min(27, img * 0.034)));
    ctx.font = `600 ${metaSize}px ${MONO}`;
    ctx.fillStyle = INK;
    const code = String(p.styleCode || "").toUpperCase();
    const codeW = spaced(ctx, code, cx, ty + metaSize + 22, 3);
    if (price) {
      ctx.font = `500 ${metaSize}px ${MONO}`;
      ctx.fillStyle = INK_3;
      spaced(ctx, "PER PIECE", cx + capW, ty + metaSize + 22, 3, "right");
    }
    const specSize = Math.round(metaSize * 1.08);
    ctx.font = `400 ${specSize}px ${BODY}`;
    ctx.fillStyle = INK_2;
    const lines = wrapLines(ctx, String(p.spec || ""), capW, 2);
    lines.forEach((ln, k) => ctx.fillText(ln, cx, ty + metaSize * 2 + 46 + k * specSize * 1.35));
    void codeW;
  });

  /* ── footer ── */
  ctx.fillStyle = RULE;
  ctx.fillRect(M, footY, W - 2 * M, 2);

  ctx.font = `500 26px ${MONO}`;
  ctx.fillStyle = INK_3;
  spaced(ctx, "TEAM COLORS", M, footY + 74, 4);
  const chips = [
    ["Primary", palette.primary],
    ["Secondary", palette.secondary],
    ["Accent", palette.accent],
    ["Dark", palette.dark],
    ["Light", palette.light],
  ].filter(([, h]) => !!h);
  const chip = 112, chipGap = 46;
  chips.forEach(([name, hex], i) => {
    const x0 = M + i * (chip + chipGap + 70);
    const y0 = footY + 104;
    ctx.fillStyle = hex;
    ctx.fillRect(x0, y0, chip, chip);
    ctx.strokeStyle = "rgba(14,17,22,0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, y0 + 1, chip - 2, chip - 2);
    ctx.font = `600 24px ${BODY}`;
    ctx.fillStyle = INK;
    ctx.fillText(name, x0, y0 + chip + 40);
    ctx.font = `500 22px ${MONO}`;
    ctx.fillStyle = INK_2;
    spaced(ctx, String(hex).toUpperCase(), x0, y0 + chip + 74, 2.5);
  });

  // fine print, right column
  const fpX = W - M;
  ctx.font = `600 30px ${BODY}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  ctx.fillText(FINE_PRINT.split(". ")[0] + ".", fpX, footY + 150);
  ctx.font = `400 30px ${BODY}`;
  ctx.fillStyle = INK_2;
  ctx.fillText(FINE_PRINT.split(". ").slice(1).join(". "), fpX, footY + 196);
  ctx.fillText("Prices are per piece, before volume discounts.", fpX, footY + 242);
  ctx.textAlign = "left";

  // maker mark
  ctx.font = `900 40px ${DISPLAY}`;
  const lab = "LAB";
  ctx.fillStyle = INK_3;
  ctx.font = `500 22px ${MONO}`;
  const madeW = measureSpaced(ctx, "MADE WITH ", 3.5);
  ctx.font = `900 40px ${DISPLAY}`;
  const mascotW = ctx.measureText("MASCOT ").width;
  const labW = ctx.measureText(lab).width + 14;
  const totalW = madeW + mascotW + labW;
  const my = footY + 304;
  let mx = fpX - totalW;
  ctx.font = `500 22px ${MONO}`;
  ctx.fillStyle = INK_3;
  mx += spaced(ctx, "MADE WITH ", mx, my, 3.5);
  ctx.font = `900 40px ${DISPLAY}`;
  ctx.fillStyle = INK;
  ctx.fillText("MASCOT", mx, my);
  mx += mascotW;
  ctx.fillStyle = INK;
  ctx.fillRect(mx - 2, my - 36, labW - 4, 46);
  ctx.fillStyle = PAPER;
  ctx.fillText(lab, mx + 5, my + 1);

  return c;
}
