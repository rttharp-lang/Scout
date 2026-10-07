// Persistence for Scout Mood. localStorage is the source of truth on this
// device (works signed-out, survives refresh); when Supabase is configured and
// the user is signed in, every save is mirrored to the private mood_boards
// table and merged back on sign-in, so boards follow the user across devices.
//
// Merging is per item (newest updatedAt wins, nothing local is dropped), and
// deletes leave tombstones, so other tabs and devices can't resurrect them.
import { supabase, authEnabled } from "../supabase";

export const KEY_EXPLORATIONS = "scout.mood.explorations.v1";
export const KEY_BOARDS = "scout.mood.boards.v1";
export const KEY_DELETED = "scout.mood.deleted.v1";
const MAX_EXPLORATIONS = 30;
// Explorations are the disposable part of storage: keep them under a byte
// budget so boards (the user's final selections), the trip planner and the
// sign-in token always have room on this origin (~5M chars in all).
const EXPLORATION_BUDGET = 2_500_000;
const TOMBSTONE_DAYS = 60;

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function read(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(key, value) {
  try { localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); return true; } catch { return false; }
}

const byUpdated = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

export const loadExplorations = () => read(KEY_EXPLORATIONS).sort(byUpdated);
export const loadBoards = () => read(KEY_BOARDS).sort(byUpdated);
export const parseList = (raw) => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

// Newest explorations first, within the count cap and byte budget; if storage
// is still full, keep dropping the oldest until the write fits.
export function saveExplorations(list) {
  let keep = [...list].sort(byUpdated).slice(0, MAX_EXPLORATIONS);
  let json = JSON.stringify(keep);
  while (json.length > EXPLORATION_BUDGET && keep.length > 1) { keep = keep.slice(0, -1); json = JSON.stringify(keep); }
  while (!write(KEY_EXPLORATIONS, json) && keep.length > 1) { keep = keep.slice(0, -1); json = JSON.stringify(keep); }
  return keep;
}

// Boards are never evicted. If the write doesn't fit, make room by dropping
// the oldest stored explorations, then retry. Returns false if it still fails.
export function saveBoards(list) {
  const json = JSON.stringify(list);
  if (write(KEY_BOARDS, json)) return true;
  let xs = read(KEY_EXPLORATIONS).sort(byUpdated);
  while (xs.length) {
    xs = xs.slice(0, -1);
    write(KEY_EXPLORATIONS, xs);
    if (write(KEY_BOARDS, json)) return true;
  }
  return false;
}

// ── Tombstones ─────────────────────────────────────────────────────────────
// { id, at, synced } — remembered for TOMBSTONE_DAYS so a delete made here (or
// in another tab) wins over stale copies coming back from elsewhere.
export function loadTombstones() {
  const cutoff = Date.now() - TOMBSTONE_DAYS * 864e5;
  return read(KEY_DELETED).filter((t) => t && t.id && t.at > cutoff);
}
export function addTombstone(id) {
  const list = loadTombstones().filter((t) => t.id !== id);
  list.push({ id, at: Date.now(), synced: false });
  write(KEY_DELETED, list);
}
function markSynced(id) {
  write(KEY_DELETED, loadTombstones().map((t) => (t.id === id ? { ...t, synced: true } : t)));
}

// Merge incoming items into local ones: newest updatedAt wins per id, local-only
// items are kept, and anything deleted after its last update stays deleted.
export function mergeLists(local, incoming, tombstones = loadTombstones()) {
  const dead = new Map(tombstones.map((t) => [t.id, t.at]));
  const alive = (x) => !(dead.has(x.id) && dead.get(x.id) >= (x.updatedAt || 0));
  const map = new Map(local.filter(alive).map((x) => [x.id, x]));
  let changed = map.size !== local.length;
  for (const item of incoming || []) {
    if (!item?.id || !alive(item)) continue;
    const mine = map.get(item.id);
    if (!mine || (item.updatedAt || 0) > (mine.updatedAt || 0)) { map.set(item.id, item); changed = true; }
  }
  return changed ? [...map.values()].sort(byUpdated) : local;
}

// ── Account sync (optional) ───────────────────────────────────────────────
async function signedIn() {
  if (!authEnabled || !supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data?.session);
}

export async function pushRemote(kind, obj) {
  if (!(await signedIn())) return;
  const { error } = await supabase.from("mood_boards").upsert({
    id: obj.id,
    kind,
    name: kind === "board" ? obj.name || "" : obj.brief?.title || "",
    data: obj,
    updated_at: new Date(obj.updatedAt || Date.now()).toISOString(),
  }, { onConflict: "user_id,id" });
  if (error) throw error;
}

export async function deleteRemote(id) {
  if (!(await signedIn())) return; // the tombstone keeps it deleted; synced on next sign-in
  const { error } = await supabase.from("mood_boards").delete().eq("id", id);
  if (error) throw error;
  markSynced(id);
}

// Retry remote deletes that didn't go through (offline, signed out, errors).
export async function syncDeletes() {
  if (!(await signedIn())) return;
  for (const t of loadTombstones().filter((x) => !x.synced)) {
    try { await deleteRemote(t.id); } catch {}
  }
}

// The signed-in user's rows, as { explorations, boards } item lists to merge.
export async function pullRemote() {
  if (!(await signedIn())) return null;
  const { data, error } = await supabase.from("mood_boards").select("id, kind, data, updated_at").order("updated_at", { ascending: false }).limit(200);
  if (error || !data) return null;
  const items = (kind) => data.filter((r) => r.kind === kind && r.data).map((r) => ({ ...r.data, id: r.id }));
  return { explorations: items("exploration"), boards: items("board") };
}
