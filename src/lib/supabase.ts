/* =====================================================================
   Supabase client — the single connection to the back end.

   SUPABASE_ENABLED is the switch between "real mode" and "mock mode":
   - Real mode (env configured, not under test): the app requires a real
     login (password + MFA), reads are RLS-scoped, mutations hit the DB.
   - Mock mode (no env, or under vitest): the service layer keeps using the
     in-memory mock seed and the dev role switcher. This keeps the unit and
     render smoke tests meaningful and lets the app run with no back end.
   ===================================================================== */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when we should talk to Supabase (configured, and not in a test run). */
export const SUPABASE_ENABLED = Boolean(url && key) && import.meta.env.MODE !== 'test';

/** The client, or null when no env is configured (mock mode). */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

/** The client asserted non-null. Call only behind a SUPABASE_ENABLED check. */
export function sb(): SupabaseClient {
  if (!supabase) throw new Error('Supabase client is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  return supabase;
}
