/* =====================================================================
   Session context — the seam between authentication and the app.

   Mock mode (no Supabase / tests): the demo role switcher drives role and
   the mock service data is used. Status is always "ready", no gate.

   Supabase mode: the real session drives everything. Password sign-in is
   AAL1; only after TOTP step-up (AAL2) do we load the user's profile, pin the
   home partner, seed the role, and hydrate the service layer from the DB. The
   dev role switcher remains (a UI lens; data stays RLS-scoped to the session).
   ===================================================================== */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ALL_PARTNERS, authService, getSelectedPartner, homePartner, setHomePartner,
  setSelectedPartner as persistPartner, getSelectedPeriod, setSelectedPeriod as persistPeriod,
  type PartnerScope, type Period, type Role,
} from '@/data';
import { KEYS, loadString, saveString } from '@/data/storage';
import { ROLES, type RoleIdentity } from '@/constants/roles';
import { SUPABASE_ENABLED, supabase } from '@/lib/supabase';
import { hydrateFromSupabase } from '@/lib/hydrate';

export type SessionStatus = 'loading' | 'signedOut' | 'needsMfa' | 'ready';

interface Profile {
  userId: string;
  role: Role;
  name: string;
  email: string;
  partner: string | null;
}

interface SessionValue {
  role: Role;
  /** Demo/dev switcher — a UI lens in Supabase mode (data stays RLS-scoped). */
  setRole: (role: Role) => void;
  /** The signed-in identity (sidebar footer, activity). */
  user: RoleIdentity;
  /** The signed-in user's id (Supabase mode), for self-action guards. Null in mock mode. */
  currentUserId: string | null;
  partnerScope: PartnerScope;
  selectedPartner: PartnerScope;
  setSelectedPartner: (id: PartnerScope) => void;
  period: Period;
  setPeriod: (id: string) => void;
  /** Auth (Supabase mode). In mock mode: status is always "ready". */
  status: SessionStatus;
  authError: string | null;
  /** Mark TOTP as freshly verified in this runtime (called by Login on a
      successful code). Grants AAL2 trust that a restored session cannot forge. */
  markMfaVerified: () => void;
  signOut: () => Promise<void>;
  /** Re-load the RLS-scoped datasets after a mutation (no-op in mock mode). */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function initialRole(): Role {
  const r = loadString(KEYS.role);
  return r === 'superadmin' || r === 'management' || r === 'referrer' ? r : 'superadmin';
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emb = (x: any): any => (Array.isArray(x) ? x[0] : x);

// In-memory (per-runtime, NON-persisted) proof that TOTP was verified in THIS
// page runtime. It resets on every fresh page load, so it cannot be restored
// from storage. A restored AAL2 session (browser session-restore / crash
// recovery re-hydrating sessionStorage, or a cold new runtime) is therefore not
// trusted as AAL2 until re-verified — the belt to sessionStorage's braces.
let mfaTrustedThisRuntime = false;

/** True when this page load is a genuine same-tab reload (F5/Cmd-R), as opposed
    to a fresh navigation, new tab, browser restart or restore. Used to keep a
    deliberate refresh signed in while forcing re-verification on a cold start. */
function isPageReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload';
  } catch {
    return false;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(initialRole);
  const [selectedPartner, setSelectedPartnerState] = useState<PartnerScope>(() => getSelectedPartner());
  const [period, setPeriodState] = useState<Period>(() => getSelectedPeriod());
  const [status, setStatus] = useState<SessionStatus>(SUPABASE_ENABLED ? 'loading' : 'ready');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  // Bumped once hydration completes so any background re-hydration (session
  // refresh, a mutation's refresh()) forces consumers to re-read live data.
  const [dataVersion, setDataVersion] = useState(0);
  const hydratedFor = useRef<string | null>(null);
  // The single in-flight hydration for a user. Concurrent resolve() calls (mount
  // + onAuthStateChange) await THIS promise rather than racing ahead to 'ready'
  // while the working copies still hold mock data.
  const hydration = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  const setRole = useCallback((next: Role) => {
    saveString(KEYS.role, next);
    setRoleState(next);
  }, []);

  const setSelectedPartner = useCallback((id: PartnerScope) => {
    persistPartner(id);
    setSelectedPartnerState(id);
  }, []);

  const setPeriod = useCallback((id: string) => {
    persistPeriod(id);
    setPeriodState(getSelectedPeriod());
  }, []);

  // Resolve the Supabase session -> status, and hydrate once at AAL2.
  const resolve = useCallback(async () => {
    if (!SUPABASE_ENABLED || !supabase) {
      setStatus('ready');
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setProfile(null);
        setStatus('signedOut');
        return;
      }
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if ((aalData?.currentLevel ?? 'aal1') !== 'aal2') {
        setStatus('needsMfa');
        return;
      }
      // Belt to sessionStorage's braces: even if the token store reports AAL2,
      // only trust it when TOTP was verified in THIS runtime. A restored session
      // (browser session-restore, crash recovery re-hydrating sessionStorage) has
      // no such proof, so we force a fresh TOTP challenge. A deliberate same-tab
      // reload (F5) is the one exception — we adopt its AAL2 and stay signed in.
      if (!mfaTrustedThisRuntime) {
        if (isPageReload()) {
          mfaTrustedThisRuntime = true;
        } else {
          setStatus('needsMfa');
          return;
        }
      }
      const userId = session.user.id;
      const { data, error } = await supabase
        .from('users')
        .select('role, full_name, email, status, partner:partners(slug)')
        .eq('id', userId)
        .single();
      if (error || !data) {
        setAuthError(error?.message ?? 'Could not load your profile.');
        setStatus('needsMfa');
        return;
      }
      // Deactivated mid-session: the ban revoked their refresh token, but a
      // still-valid access token could otherwise linger until it expires. Sign
      // out immediately on any app load so deactivation takes effect at once.
      if ((data.status as string) === 'deactivated') {
        await supabase.auth.signOut();
        hydratedFor.current = null;
        hydration.current = null;
        setProfile(null);
        setAuthError('This account has been deactivated. Contact your administrator.');
        setStatus('signedOut');
        return;
      }
      const prof: Profile = {
        userId,
        role: data.role as Role,
        name: data.full_name as string,
        email: data.email as string,
        partner: emb(data.partner)?.slug ?? null,
      };
      if (prof.partner) setHomePartner(prof.partner);
      setProfile(prof);
      setRole(prof.role);
      if (hydratedFor.current !== userId) {
        // Start hydration exactly once per user; concurrent resolves reuse and
        // await the same promise. Critically, 'ready' is only set AFTER this
        // resolves, so the app never renders the mock working copies in live mode.
        if (hydration.current?.userId !== userId) {
          hydration.current = { userId, promise: hydrateFromSupabase(userId) };
        }
        try {
          await hydration.current.promise;
        } catch (e) {
          hydration.current = null; // allow a later resolve() to retry
          throw e;
        }
        hydratedFor.current = userId;
        setDataVersion((v) => v + 1);
      }
      setAuthError(null);
      setStatus('ready');
    } catch (e) {
      hydratedFor.current = null;
      hydration.current = null; // drop any cached promise so the next resolve() re-hydrates
      setAuthError(e instanceof Error ? e.message : 'Sign-in failed.');
      setStatus('needsMfa');
    }
  }, [setRole]);

  useEffect(() => {
    if (!SUPABASE_ENABLED || !supabase) return;
    void resolve();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void resolve();
    });
    return () => sub.subscription.unsubscribe();
  }, [resolve]);

  const markMfaVerified = useCallback(() => {
    mfaTrustedThisRuntime = true;
  }, []);

  const signOut = useCallback(async () => {
    if (SUPABASE_ENABLED) {
      hydratedFor.current = null;
      // Drop the cached hydration promise: signing back in (even as the same
      // user, in-page with no reload) must re-fetch, not replay a stale snapshot.
      hydration.current = null;
      // Revoke AAL2 trust: a fresh sign-in must re-verify TOTP, not inherit it.
      mfaTrustedThisRuntime = false;
      await authService.signOut();
      setProfile(null);
      setStatus('signedOut');
    }
  }, []);

  const refresh = useCallback(async () => {
    if (SUPABASE_ENABLED && hydratedFor.current) {
      await hydrateFromSupabase(hydratedFor.current);
      setDataVersion((v) => v + 1); // re-read the refreshed working copies
    }
  }, []);

  // Expose the role on <html> for role-scoped CSS (mirrors portal.js).
  useEffect(() => {
    document.documentElement.setAttribute('data-role', role);
  }, [role]);

  const partnerScope = role === 'superadmin' ? selectedPartner : homePartner();

  const user: RoleIdentity = profile
    ? { name: profile.name, label: ROLES[profile.role].label, initials: initialsOf(profile.name) }
    : ROLES[role];

  const value = useMemo<SessionValue>(
    () => ({ role, setRole, user, currentUserId: profile?.userId ?? null, partnerScope, selectedPartner, setSelectedPartner, period, setPeriod, status, authError, markMfaVerified, signOut, refresh }),
    // dataVersion is intentionally a dep: bumping it after (re-)hydration changes
    // the context identity so consumers re-read the refreshed working copies.
    [role, setRole, user, profile, partnerScope, selectedPartner, setSelectedPartner, period, setPeriod, status, authError, markMfaVerified, signOut, refresh, dataVersion],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}

export { ALL_PARTNERS };
