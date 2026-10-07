// Persistence for Scout Mood. localStorage is the source of truth on this
// device (works signed-out, survives refresh); when Supabase is configured and
// the user is signed in, every save is mirrored to the private mood_boards
// table and pulled back on sign-in, so boards follow the user across devices.
import { supabase, authEnabled } from "../supabase";

const KEY_EXPLORATIONS = "scout.mood.explorations.v1";
const KEY_BOARDS = "scout.mood.boards.v1";
const MAX_EXPLORATIONS = 30;

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function read(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); return true; } catch { return false; }
}

const byUpdated = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

export const loadExplorations = () => read(KEY_EXPLORATIONS).sort(byUpdated);
export const loadBoards = () => read(KEY_BOARDS).sort(byUpdated);

// Keep the newest explorations; if storage is full, drop the oldest until it fits.
export function saveExplorations(list) {
  let keep = [...list].sort(byUpdated).slice(0, MAX_EXPLORATIONS);
  while (!write(KEY_EXPLORATIONS, keep) && keep.length > 1) keep = keep.slice(0, -1);
  return keep;
}
export const saveBoards = (list) => { write(KEY_BOARDS, list); return list; };

// ── Account sync (optional) ───────────────────────────────────────────────
// Strip transient fields (in-flight status) before persisting remotely.
const snapshot = (kind, obj) => {
  if (kind !== "exploration") return obj;
  const { status, ...rest } = obj;
  return rest;
};

export async function pushRemote(kind, obj) {
  if (!authEnabled || !supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return;
  const { error } = await supabase.from("mood_boards").upsert({
    id: obj.id,
    kind,
    name: kind === "board" ? obj.name || "" : obj.brief?.title || "",
    data: snapshot(kind, obj),
    updated_at: new Date(obj.updatedAt || Date.now()).toISOString(),
  }, { onConflict: "user_id,id" });
  if (error) throw error;
}

export async function deleteRemote(id) {
  if (!authEnabled || !supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return;
  await supabase.from("mood_boards").delete().eq("id", id);
}

// Merge remote rows into local lists: newest updatedAt wins per id.
export async function pullRemote(localExplorations, localBoards) {
  if (!authEnabled || !supabase) return null;
  const { data, error } = await supabase.from("mood_boards").select("id, kind, data, updated_at").order("updated_at", { ascending: false }).limit(200);
  if (error || !data) return null;
  const merge = (local, kind) => {
    const map = new Map(local.map((x) => [x.id, x]));
    for (const row of data) {
      if (row.kind !== kind || !row.data) continue;
      const remote = { ...row.data, id: row.id };
      const mine = map.get(row.id);
      if (!mine || (remote.updatedAt || 0) > (mine.updatedAt || 0)) map.set(row.id, remote);
    }
    return [...map.values()].sort(byUpdated);
  };
  return { explorations: merge(localExplorations, "exploration"), boards: merge(localBoards, "board") };
}
