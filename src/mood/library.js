// The designer-approved library (Supabase, see supabase/mood.sql).
// Approval is enforced by row-level security, not by this client: only
// accounts an admin has added to mood_curators with verified = true can
// insert approvals, and approvals disappear if that curator is un-verified.
// Without Supabase configured, every function here is a harmless no-op and the
// UI explains that designer approval isn't set up — it never fakes a badge.
import { supabase, authEnabled } from "../supabase";
import { resolveImages } from "./api.js";

export const libraryEnabled = authEnabled;

const APPROVAL_COLS = "id, image_id, image, tags, story, note, created_at, curator_id, curator:mood_curators(display_name, title, house)";

// Same photo? Origin + path of the thumbnail (query strings carry sizing).
export const imageBase = (url) => { try { const u = new URL(url); return `${u.origin}${u.pathname}`; } catch { return ""; } };

// An approval counts for a pin only if it's for the same photo (same id AND
// same image at the source), so a badge can never land on an image the
// curator didn't see.
export const approvalOf = (approvals, pin) => (approvals[pin.id] || []).find((a) => !a.base || a.base === imageBase(pin.thumb)) || null;

const toApproval = (row) => ({
  id: row.id,
  base: imageBase(row.image?.thumb),
  imageId: row.image_id,
  note: row.note || "",
  story: row.story || "",
  tags: row.tags || [],
  at: row.created_at,
  curatorId: row.curator_id,
  by: row.curator?.display_name || "",
  title: row.curator?.title || "",
  house: row.curator?.house || "",
});

// The signed-in user's curator row (verified or pending), or null.
export async function getMyCurator() {
  if (!libraryEnabled) return null;
  const { data: s } = await supabase.auth.getSession();
  const me = s?.session?.user?.id;
  if (!me) return null;
  const { data } = await supabase.from("mood_curators").select("user_id, display_name, title, house, verified").eq("user_id", me).maybeSingle();
  return data || null;
}

// Approvals for a set of image ids → { [imageId]: Approval[] } (newest first).
export async function approvalsFor(ids) {
  if (!libraryEnabled || !ids.length) return {};
  const out = {};
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from("mood_approvals").select(APPROVAL_COLS).in("image_id", ids.slice(i, i + 150)).order("created_at", { ascending: false });
    if (error) throw error;
    for (const row of data || []) {
      if (!row.curator) continue; // curator no longer verified
      (out[row.image_id] ||= []).push(toApproval(row));
    }
  }
  return out;
}

// Library images whose tags overlap the brief's keywords — designer-approved
// picks that seed a new board before the AI-curated images arrive.
export async function matchLibrary(keywords, limit = 24) {
  const tags = [...new Set(keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean))].slice(0, 40);
  if (!libraryEnabled || !tags.length) return [];
  const { data, error } = await supabase.from("mood_approvals").select(APPROVAL_COLS).overlaps("tags", tags).order("created_at", { ascending: false }).limit(limit * 2);
  if (error) throw error;
  const seen = new Set();
  const out = [];
  for (const row of data || []) {
    if (!row.curator || !row.image?.id || seen.has(row.image_id)) continue;
    seen.add(row.image_id);
    out.push({ image: row.image, approval: toApproval(row) });
    if (out.length >= limit) break;
  }
  return out;
}

// An approval stores the image exactly as its SOURCE describes it, fetched
// server-side by id — never the pin data held in a browser (a review request's
// snapshot is written by its requester). If the source's thumbnail isn't the
// one the curator was looking at, nothing is approved.
export async function canonicalImage(pin) {
  const found = (await resolveImages([pin.id]))[pin.id];
  if (!found) throw new Error("Couldn't verify this image at its source, so it wasn't approved.");
  if (imageBase(found.thumb) !== imageBase(pin.thumb)) throw new Error("This image's data doesn't match its source, so it wasn't approved.");
  return found;
}

export async function approve(pin, { note = "", tags = [], story = "" }) {
  const image = await canonicalImage(pin);
  const { data, error } = await supabase.from("mood_approvals").upsert({
    image_id: image.id,
    image,
    tags: [...new Set(tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean))].slice(0, 30),
    story: String(story).slice(0, 120),
    note: String(note).slice(0, 500),
  }, { onConflict: "image_id,curator_id" }).select(APPROVAL_COLS).single();
  if (error) throw error;
  return toApproval(data);
}

export async function revoke(imageId) {
  const { data: s } = await supabase.auth.getSession();
  const { error } = await supabase.from("mood_approvals").delete().eq("image_id", imageId).eq("curator_id", s?.session?.user?.id);
  if (error) throw error;
}

export async function myApprovals(limit = 200) {
  const { data: s } = await supabase.auth.getSession();
  const { data, error } = await supabase.from("mood_approvals").select(APPROVAL_COLS).eq("curator_id", s?.session?.user?.id).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).map((row) => ({ ...toApproval(row), image: row.image }));
}

// ── Review requests ───────────────────────────────────────────────────────
export async function requestReview(snapshot, message = "") {
  const { data, error } = await supabase.from("mood_review_requests").insert({ board: snapshot, message: String(message).slice(0, 1000) }).select("id, status, created_at").single();
  if (error) throw error;
  return data;
}

// Curators see the whole queue (RLS); everyone else sees only their own.
export async function listReviewRequests() {
  const { data, error } = await supabase.from("mood_review_requests").select("id, requester_id, board, message, status, decisions, reviewed_by, created_at, updated_at").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

// decisions: { [imageId]: { verdict, note, by } } — the caller merges its own
// verdicts over other curators' (updated_at is stamped by the database).
export async function decideReview(id, decisions) {
  const { data: s } = await supabase.auth.getSession();
  const { error } = await supabase.from("mood_review_requests").update({
    decisions,
    status: "done",
    reviewed_by: s?.session?.user?.id,
  }).eq("id", id);
  if (error) throw error;
}

export async function dismissReview(id) {
  const { error } = await supabase.from("mood_review_requests").delete().eq("id", id);
  if (error) throw error;
}

// Ids of currently verified curators (RLS shows the public only verified ones).
export async function verifiedCuratorIds() {
  const { data, error } = await supabase.from("mood_curators").select("user_id").eq("verified", true);
  if (error) throw error;
  return new Set((data || []).map((r) => r.user_id));
}

export async function myUserId() {
  const { data: s } = await supabase.auth.getSession();
  return s?.session?.user?.id || null;
}
