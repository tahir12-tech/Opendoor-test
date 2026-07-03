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
  ALL_PARTNERS, authService, getSelectedPartner, homePartner, scopeFor, setHomePartner,
  setSelectedPartner as persistPartner, getSelectedPeriod, setSelectedPeriod as persistPeriod,
  type PartnerScope, type Period, type Role,
} from '@/data';
import { KEYS, loadString, saveString } from '@/data/storage';
import { ROLES, type RoleIdentity } from '@/constants/roles';
import { SUPABASE_ENABLED, supabase } from '@/lib/supabase';
import { hydrateFromSupabase } from '@/lib/hydrate';

export type SessionStatus = 'loading' | 'signedOut' | 'needsMfa' | 'ready';

interface Profile {
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
  partnerScope: PartnerScope;
  selectedPartner: PartnerScope;
  setSelectedPartner: (id: PartnerScope) => void;
  period: Period;
  setPeriod: (id: string) => void;
  /** Auth (Supabase mode). In mock mode: status is always "ready". */
  status: SessionStatus;
  authError: string | null;
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(initialRole);
  const [selectedPartner, setSelectedPartnerState] = useState<PartnerScope>(() => getSelectedPartner());
  const [period, setPeriodState] = useState<Period>(() => getSelectedPeriod());
  const [status, setStatus] = useState<SessionStatus>(SUPABASE_ENABLED ? 'loading' : 'ready');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const hydratedFor = useRef<string | null>(null);

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
      const userId = session.user.id;
      const { data, error } = await supabase
        .from('users')
        .select('role, full_name, email, partner:partners(slug)')
        .eq('id', userId)
        .single();
      if (error || !data) {
        setAuthError(error?.message ?? 'Could not load your profile.');
        setStatus('needsMfa');
        return;
      }
      const prof: Profile = {
        role: data.role as Role,
        name: data.full_name as string,
        email: data.email as string,
        partner: emb(data.partner)?.slug ?? null,
      };
      if (prof.partner) setHomePartner(prof.partner);
      setProfile(prof);
      setRole(prof.role);
      if (hydratedFor.current !== userId) {
        hydratedFor.current = userId;
        await hydrateFromSupabase(userId);
      }
      setAuthError(null);
      setStatus('ready');
    } catch (e) {
      hydratedFor.current = null;
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

  const signOut = useCallback(async () => {
    if (SUPABASE_ENABLED) {
      hydratedFor.current = null;
      await authService.signOut();
      setProfile(null);
      setStatus('signedOut');
    }
  }, []);

  const refresh = useCallback(async () => {
    if (SUPABASE_ENABLED && hydratedFor.current) await hydrateFromSupabase(hydratedFor.current);
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
    () => ({ role, setRole, user, partnerScope, selectedPartner, setSelectedPartner, period, setPeriod, status, authError, signOut, refresh }),
    [role, setRole, user, partnerScope, selectedPartner, setSelectedPartner, period, setPeriod, status, authError, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}

/** Convenience: scopeFor for a role (kept aligned with the service rule). */
export function resolveScope(role: Role): PartnerScope {
  return scopeFor(role);
}

export { ALL_PARTNERS };
