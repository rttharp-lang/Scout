// The designer-approved library (Supabase, see supabase/mood.sql).
// Approval is enforced by row-level security, not by this client: only
// accounts an admin has added to mood_curators with verified = true can
// insert approvals, and approvals disappear if that curator is un-verified.
// Without Supabase configured, every function here is a harmless no-op and the
// UI explains that designer approval isn't set up — it never fakes a badge.
import { supabase, authEnabled } from "../supabase";

export const libraryEnabled = authEnabled;

const APPROVAL_COLS = "id, image_id, image, tags, story, note, created_at, curator_id, curator:mood_curators(display_name, title, house)";

const toApproval = (row) => ({
  id: row.id,
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

const cleanImage = (pin) => {
  const { approval, score, role, note, storyId, ...image } = pin;
  return image;
};

export async function approve(pin, { note = "", tags = [], story = "" }) {
  const { data, error } = await supabase.from("mood_approvals").upsert({
    image_id: pin.id,
    image: cleanImage(pin),
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

export async function decideReview(id, decisions) {
  const { data: s } = await supabase.auth.getSession();
  const { error } = await supabase.from("mood_review_requests").update({
    decisions,
    status: "done",
    reviewed_by: s?.session?.user?.id,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
}
