/* =====================================================================
   Browser-session liveness heartbeat.

   The auth token is stored in localStorage, so it is SHARED across tabs: open a
   link in a new tab and you stay signed in. That alone would also survive a full
   browser quit, which we do NOT want. So we pair the shared token with a
   heartbeat: while any tab is open, it stamps a "browser session alive at T"
   timestamp into localStorage every few seconds (and on pagehide). On a fresh
   page runtime we resume an AAL2 session ONLY if that timestamp is within a short
   RESUME window; otherwise the browser was fully closed and we force a fresh
   sign-in including TOTP.

   Liveness has two tiers so a short window can stay strict without punishing a
   legitimately-open-but-idle tab:
   1. A recent stamp (< RESUME_WINDOW_MS old) resumes immediately.
   2. If the stamp looks stale, we actively ping other tabs over a BroadcastChannel
      and resume if any TRUSTED live tab answers. This covers a tab whose timer was
      throttled while backgrounded (Chrome throttles background timers to ~1/min),
      which would otherwise let the stamp age past the window even though a tab is
      still open. A fully-closed browser has no tab to answer, so it re-authenticates.

   Exact real-world behaviour:
   - Same-tab refresh (F5): the last heartbeat is a few seconds old  -> resume.
   - New tab / open link in new tab (any tab still open): a live tab keeps the
     stamp fresh, or answers the liveness ping if it was throttled -> resume.
   - Full browser quit and reopen: no tab stamps and none answers the ping -> full
     re-authentication including TOTP.

   There is no long-lived "keep me signed in": the window is seconds, not days.
   The token surviving in localStorage is inert on its own — recent liveness is the
   gate, and the in-runtime AAL2 marker (SessionContext) is the belt.
   ===================================================================== */

const KEY = 'opndoor.session.alive';
const CHANNEL = 'opndoor.session';
const HEARTBEAT_MS = 2500;
/** How recently a tab must have been alive for a fresh runtime to resume without
    re-authenticating (or, failing that, for a live tab to answer the ping).
    Comfortably covers a page reload and opening a new tab, while a genuine
    browser quit/reopen exceeds it and answers no ping. */
export const RESUME_WINDOW_MS = 10000;
/** How long a new runtime waits for a live tab to answer its liveness ping. */
const PING_TIMEOUT_MS = 300;

const hasStorage = (): boolean => typeof window !== 'undefined' && !!window.localStorage;

/** Stamp the browser session as alive right now (shared across tabs). */
export function markSessionAlive(clock: number = Date.now()): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(KEY, String(clock));
  } catch {
    /* storage full / disabled: fail closed (no resume) rather than throw */
  }
}

/** Forget the alive marker: an explicit sign-out must not let a new tab resume. */
export function clearSessionAlive(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * True when a tab in this browser session was alive within the resume window,
 * i.e. this load is a same-tab refresh or a new tab of a still-live session,
 * rather than a cold start after the browser was fully closed.
 * Read the PRIOR value before starting this runtime's heartbeat.
 */
export function sessionRecentlyAlive(clock: number = Date.now()): boolean {
  if (!hasStorage()) return false;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return false;
    const ts = Number(raw);
    // A missing/garbage/future timestamp is not a valid recent liveness.
    if (!Number.isFinite(ts) || ts > clock) return false;
    return clock - ts <= RESUME_WINDOW_MS;
  } catch {
    return false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let bound = false;
let responder: BroadcastChannel | null = null;

function hasBroadcast(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

/** Keep the heartbeat fresh while this tab is open, and answer other tabs'
    liveness pings. Idempotent; call once the session is trusted (resumed or
    freshly TOTP-verified). */
export function startHeartbeat(): void {
  markSessionAlive();
  if (timer === null) {
    timer = setInterval(() => markSessionAlive(), HEARTBEAT_MS);
  }
  // Answer liveness pings so a peer whose stamp went stale (background timer
  // throttling) can still confirm a live session exists. Only a running
  // (trusted, not signed-out) heartbeat answers.
  if (responder === null && hasBroadcast()) {
    responder = new BroadcastChannel(CHANNEL);
    responder.onmessage = (e: MessageEvent) => {
      if (e.data === 'ping' && timer !== null) responder?.postMessage('alive');
    };
  }
  if (typeof window !== 'undefined' && !bound) {
    bound = true;
    // Stamp on hide/unload so a reload or tab-close records a very recent
    // liveness, and refresh when a backgrounded tab is brought forward. Both
    // no-op once the heartbeat is stopped (after sign-out), so a closing signed-
    // out tab can never re-stamp liveness for the next tab.
    window.addEventListener('pagehide', () => { if (timer !== null) markSessionAlive(); });
    window.addEventListener('visibilitychange', () => {
      if (timer !== null && !document.hidden) markSessionAlive();
    });
  }
}

/** Stop stamping and answering pings (explicit sign-out). Safe when not running. */
export function stopHeartbeat(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  if (responder !== null) {
    try { responder.close(); } catch { /* ignore */ }
    responder = null;
  }
}

/**
 * Ask other tabs whether any TRUSTED live session is present right now, resolving
 * true on the first answer within PING_TIMEOUT_MS. This is the fallback when the
 * shared stamp looks stale but a tab is in fact still open (its heartbeat timer
 * was throttled while backgrounded). A fully-closed browser answers nothing.
 */
export function anyTabAlive(timeoutMs: number = PING_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    if (!hasBroadcast()) { resolve(false); return; }
    let ch: BroadcastChannel;
    try { ch = new BroadcastChannel(CHANNEL); } catch { resolve(false); return; }
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      try { ch.close(); } catch { /* ignore */ }
      resolve(v);
    };
    ch.onmessage = (e: MessageEvent) => { if (e.data === 'alive') finish(true); };
    try { ch.postMessage('ping'); } catch { finish(false); return; }
    setTimeout(() => finish(false), timeoutMs);
  });
}
