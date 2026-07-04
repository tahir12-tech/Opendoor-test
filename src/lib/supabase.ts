/* =====================================================================
   Supabase client — the single connection to the back end.

   SUPABASE_ENABLED is the switch between "real mode" and "mock mode":
   - Real mode (env configured, not under test): the app requires a real
     login (password + MFA), reads are RLS-scoped, mutations hit the DB.
   - Mock mode (no env, or under vitest): the service layer keeps using the
     in-memory mock seed and the dev role switcher. This keeps the unit and
     render smoke tests meaningful and lets the app run with no back end.

   SESSION LIFETIME (this portal holds tenant PII, so sessions are deliberately
   short-lived): the auth token is stored in localStorage, so it is SHARED across
   tabs — opening a link in a new tab keeps you signed in. To stop that same
   shared token from surviving a full browser quit, it is paired with a
   cross-tab "browser session alive" heartbeat (see session/browserSession.ts):
   on a fresh page runtime SessionContext resumes an AAL2 session only if the
   heartbeat shows the browser was alive within the last few seconds, and
   otherwise forces a fresh sign-in including TOTP. Real-world behaviour: same-tab
   refresh = signed in; new tab = signed in; full browser quit/reopen = full
   re-authentication. There is no long-lived "keep me signed in" (the window is
   seconds, not days), and the in-runtime AAL2 marker is the additional belt.
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
        auth: {
          persistSession: true,
          // localStorage (the default): shared across tabs so a new tab stays
          // signed in. Quit-survival is bounded not by the storage choice but by
          // the browser-session heartbeat + in-runtime AAL2 marker (SessionContext).
          storage: typeof window !== 'undefined' ? window.localStorage : undefined,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

/** The client asserted non-null. Call only behind a SUPABASE_ENABLED check. */
export function sb(): SupabaseClient {
  if (!supabase) throw new Error('Supabase client is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  return supabase;
}
