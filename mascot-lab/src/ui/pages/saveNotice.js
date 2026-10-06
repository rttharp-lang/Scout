// Mascot Lab — what to tell the coach after saveFile() (platform/files.js), shared by
// every download button (Studio PNG, Collection line sheet + garment PNG, Done files,
// the owner inbox). Inside the claude.ai Artifact frame without the `downloads`
// capability nothing can be saved ({ ok: false, how: "anchor-inert" }), so the UI says
// that plainly instead of "download started".

export const CANT_SAVE_TITLE = "Downloads aren't available in this view";
export const CANT_SAVE_BODY = "Open the site in a browser to save files.";
export const CANT_SAVE_HERE = `${CANT_SAVE_TITLE}. ${CANT_SAVE_BODY}`;

/** cantSaveHere(result) → true when this view has no way to save a file at all. */
export const cantSaveHere = (r) => !!r && !r.ok && (r.how === "anchor-inert" || r.code === "downloads_unavailable");

/** saveError(result) → one sentence for a failed save. */
export function saveError(r, fallback = "The file couldn't be saved.") {
  if (cantSaveHere(r)) return CANT_SAVE_HERE;
  return r?.error || fallback;
}

/** saveToast(result, { what, filename, detail? }) → a toast for what saveFile said. */
export function saveToast(result, { what, filename, detail }) {
  const tail = detail ? ` · ${detail}` : "";
  if (result?.ok) {
    return result.how === "downloads"
      ? { tone: "success", title: `${what} saved`, body: `${filename}${tail}` }
      : { tone: "success", title: `${what} download started`, body: `${filename}${tail}. Check your downloads folder.` };
  }
  if (cantSaveHere(result)) return { tone: "warning", title: CANT_SAVE_TITLE, body: `${what} not saved. ${CANT_SAVE_BODY}`, duration: 9000 };
  if (result?.code === "declined") return { tone: "info", title: "Download canceled", body: `${filename} was not saved.` };
  return { tone: "danger", title: `${what} not saved`, body: saveError(result, "The file couldn't be saved here.") };
}
