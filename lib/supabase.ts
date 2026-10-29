import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _sb: SupabaseClient | null = null;

/** Server-only client with the service role key (bypasses RLS). Never import from client code. */
export function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured on the server.");
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

export const RECORDINGS = "recordings";
