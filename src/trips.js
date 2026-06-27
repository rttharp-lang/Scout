// Saved-trip storage backed by a Supabase `trips` table with row-level
// security, so each signed-in user only ever sees their own trips. The table's
// user_id column defaults to auth.uid(), so inserts don't pass it explicitly.
import { supabase } from "./supabase";

const COLS = "id, city, dates, tiers, trip, created_at";

export async function listTrips() {
  const { data, error } = await supabase
    .from("trips")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveTrip({ city, dates, tiers, trip }) {
  const { data, error } = await supabase
    .from("trips")
    .insert({ city, dates, tiers, trip })
    .select(COLS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateTrip(id, { city, dates, tiers, trip }) {
  const { data, error } = await supabase
    .from("trips")
    .update({ city, dates, tiers, trip })
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTrip(id) {
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) throw error;
}
