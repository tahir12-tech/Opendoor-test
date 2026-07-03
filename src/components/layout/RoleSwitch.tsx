/* =====================================================================
   Top-bar role indicator.

   In mock/dev mode (no Supabase env, or under test) this is the demo role
   switcher (.roleswitch): flip between opndoor admin / Management / Referrer
   and watch access change. It is gated on MOCK_MODE below, a compile-time
   constant built from Vite-inlined env vars. In a real build that folds to
   `false`, so DevRoleSwitch is dead-code eliminated from the bundle.

   In Supabase mode (real sessions) the top bar shows no role indicator at all;
   the signed-in user's role appears in the sidebar footer under their name.
   Real users never see any role-switching control.

   The switcher is never a security boundary: access is secured by RLS + MFA
   in the database and the RequireRole route guards.
   ===================================================================== */
import { useSession } from '@/session/SessionContext';
import { ROLE_SWITCH } from '@/constants/roles';
import './RoleSwitch.css';

// Compile-time constant: true only in mock/dev/test mode. Vite inlines these
// env vars, so a real build (Supabase env present) folds this to `false` and
// esbuild eliminates the DevRoleSwitch branch. Mirrors !SUPABASE_ENABLED.
const MOCK_MODE =
  !import.meta.env.VITE_SUPABASE_URL ||
  !import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.MODE === 'test';

/** Dev-only interactive switcher. Excluded from the production build output. */
function DevRoleSwitch() {
  const { role, setRole } = useSession();
  return (
    <div className="roleswitch" title="Demo: switch role to see access change">
      {ROLE_SWITCH.map((r) => (
        <button key={r.id} className={`roleswitch__btn${r.id === role ? ' is-active' : ''}`} onClick={() => setRole(r.id)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function RoleSwitch() {
  // Mock/dev/test: the demo switcher. Real Supabase sessions: no top-bar role
  // indicator at all (the role is shown in the sidebar footer under the name).
  if (MOCK_MODE) return <DevRoleSwitch />;
  return null;
}
