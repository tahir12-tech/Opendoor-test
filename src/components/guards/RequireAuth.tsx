/* =====================================================================
   RequireAuth — the authentication gate for the app shell.

   Mock mode (tests / no env): a passthrough, so the render smoke test and
   env-less dev keep working against the mock data.

   Supabase mode: a real session at AAL2 is required. A password-only (AAL1)
   or absent session is sent to /login, where the MFA step completes. This is
   the front-end mirror of the database's AAL2 requirement.
   ===================================================================== */
import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/session/SessionContext';
import { SUPABASE_ENABLED } from '@/lib/supabase';

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: 'var(--muted, #667)' }}>
      <div>{children}</div>
    </div>
  );
}

export function RequireAuth() {
  const { status, authError } = useSession();

  if (!SUPABASE_ENABLED) return <Outlet />;
  if (status === 'loading') return <FullScreen>Loading your workspace…</FullScreen>;
  if (authError) {
    return (
      <FullScreen>
        <p>{authError}</p>
        <p><a href="/login">Back to sign in</a></p>
      </FullScreen>
    );
  }
  if (status !== 'ready') return <Navigate to="/login" replace />;
  return <Outlet />;
}
