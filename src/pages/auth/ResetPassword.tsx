/* =====================================================================
   Set a new password — the landing screen for the recovery link sent by
   send-password-reset. Supabase's detectSessionInUrl turns the recovery token
   in the URL into a short-lived session; this screen confirms that session,
   takes a new password via auth.updateUser, then signs out so the next sign-in
   is a fresh password + TOTP. It sits OUTSIDE RequireAuth (a public route), so
   the AAL1 recovery session never routes the user into the app before they set
   a password.
   ===================================================================== */
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SUPABASE_ENABLED, sb } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import './auth.css';
import '../ForgotPassword/ForgotPassword.css';

type Phase = 'checking' | 'ready' | 'invalid' | 'done';

export function ResetPassword() {
  useDocumentTitle('Set a new password');
  const [phase, setPhase] = useState<Phase>(SUPABASE_ENABLED ? 'checking' : 'ready');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    let settled = false;
    const mark = (hasSession: boolean) => {
      if (settled) return;
      settled = true;
      setPhase(hasSession ? 'ready' : 'invalid');
    };
    // detectSessionInUrl converts the recovery token in the URL hash into a
    // session; the event may land just after mount, so listen and also poll once.
    const { data: sub } = sb().auth.onAuthStateChange((_evt, session) => { if (session) mark(true); });
    sb().auth.getSession().then(({ data }) => {
      if (data.session) mark(true);
      else setTimeout(() => { sb().auth.getSession().then(({ data: d2 }) => mark(!!d2.session)); }, 900);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 8) { setError('Use at least 8 characters.'); return; }
    if (pw !== pw2) { setError('Those passwords do not match.'); return; }
    if (busy) return;
    setBusy(true);
    try {
      if (SUPABASE_ENABLED) {
        const { error: upErr } = await sb().auth.updateUser({ password: pw });
        if (upErr) {
          setError('We could not set your password. The link may have expired. Request a new one.');
          return;
        }
        // Drop the recovery session: the next sign-in is a fresh password + TOTP.
        await sb().auth.signOut();
      }
      setPhase('done');
    } catch {
      setError('Something went wrong. Please request a new reset link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth__brand">
        <div className="auth__brand-top">
          <span className="wordmark">opndoor</span>
          <span className="auth__cobrand">Guarantee<br />Referral Portal</span>
        </div>
        <div className="auth__brand-mid">
          <span className="auth__eyebrow">Account recovery</span>
          <h1 className="auth__brand-h1">Choose a new password.</h1>
          <p className="auth__brand-copy">Pick a strong, unique password. After you save it you will sign in with your new password and verify with your authenticator code as usual.</p>
        </div>
        <div className="auth__flow">
          <div className="auth__flow-item">
            <span className="auth__flow-ic"><Icon name="lock" /></span>
            <div><div className="auth__flow-t">Set a new password</div><div className="auth__flow-s">At least 8 characters</div></div>
          </div>
          <div className="auth__flow-item">
            <span className="auth__flow-ic"><Icon name="shield" /></span>
            <div><div className="auth__flow-t">Two-factor still applies</div><div className="auth__flow-s">You will verify with your code as usual</div></div>
          </div>
        </div>
      </aside>

      <section className="auth__form-wrap">
        <div className="auth__card">
          {phase === 'checking' && (
            <div>
              <h2 className="auth__title">Checking your link…</h2>
              <p className="auth__sub">One moment while we verify your reset link.</p>
            </div>
          )}

          {phase === 'invalid' && (
            <div>
              <div className="confirm-ic"><Icon name="alert" strokeWidth={2.4} /></div>
              <h2 className="auth__title">This link is not valid</h2>
              <p className="auth__sub">Your reset link may have expired or already been used. Request a new one and we will email you a fresh link.</p>
              <div className="auth__form">
                <Button variant="primary" block to="/forgot-password">Request a new link</Button>
              </div>
              <p className="auth__foot">Remembered it? <Link to="/login">Back to sign in</Link></p>
            </div>
          )}

          {phase === 'ready' && (
            <div>
              <h2 className="auth__title">Set a new password</h2>
              <p className="auth__sub">Choose a strong password you do not use elsewhere.</p>
              <form className="auth__form" onSubmit={submit} noValidate>
                <div className="field">
                  <label htmlFor="pw">New password</label>
                  <input id="pw" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="pw2">Confirm new password</label>
                  <input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
                </div>
                {error && <p className="auth__error" role="alert" style={{ color: 'var(--danger, #c0392b)' }}>{error}</p>}
                <Button variant="primary" block type="submit" arrow disabled={busy || !pw || !pw2}>{busy ? 'Saving…' : 'Save new password'}</Button>
              </form>
              <p className="auth__foot"><Link to="/login">Back to sign in</Link></p>
            </div>
          )}

          {phase === 'done' && (
            <div>
              <div className="confirm-ic"><Icon name="check" strokeWidth={2.4} /></div>
              <h2 className="auth__title">Password updated</h2>
              <p className="auth__sub">Your password has been changed. Sign in with your new password, then verify with your authenticator code.</p>
              <div className="auth__form">
                <Button variant="primary" block to="/login">Back to sign in</Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
