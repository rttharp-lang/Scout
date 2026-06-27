// Supabase client for auth + saved trips. Reads public config from Vite env
// vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). When those aren't set
// the app runs exactly as before — auth and saving are simply hidden — so the
// site never breaks before Supabase is configured.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const authEnabled = Boolean(url && anonKey);
export const supabase = authEnabled ? createClient(url, anonKey) : null;
