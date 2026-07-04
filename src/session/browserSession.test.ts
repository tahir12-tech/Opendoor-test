/* Proves the middle-path session model: the auth token is shared across tabs
   (localStorage), and a cross-tab liveness heartbeat decides whether a fresh
   page runtime may resume an AAL2 session or must re-authenticate. The three
   required behaviours reduce to the age of the heartbeat that resolve() reads
   BEFORE this runtime starts its own:
     - same-tab refresh   -> heartbeat a few seconds old   -> resume
     - new tab (live tab) -> heartbeat kept fresh by a peer -> resume
     - browser quit/reopen -> heartbeat stale or absent     -> re-authenticate  */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RESUME_WINDOW_MS, anyTabAlive, clearSessionAlive, markSessionAlive,
  sessionRecentlyAlive, startHeartbeat, stopHeartbeat,
} from './browserSession';

const T = 1_000_000_000_000; // fixed "now" base (ms)

beforeEach(() => { localStorage.clear(); stopHeartbeat(); });
afterEach(() => { localStorage.clear(); stopHeartbeat(); });

describe('cold start (no prior liveness)', () => {
  it('does NOT resume when there is no heartbeat at all', () => {
    expect(sessionRecentlyAlive(T)).toBe(false);
  });
});

describe('same-tab refresh = stay signed in', () => {
  it('resumes when the heartbeat was stamped moments before the reload', () => {
    markSessionAlive(T);                 // last stamp before unload
    expect(sessionRecentlyAlive(T + 1000)).toBe(true);   // ~1s later on reload
  });
});

describe('new tab of a still-live session = stay signed in', () => {
  it('resumes when another open tab kept the heartbeat fresh', () => {
    markSessionAlive(T);                 // a live tab's heartbeat
    expect(sessionRecentlyAlive(T + 2500)).toBe(true);   // new tab opens shortly after
  });
});

describe('full browser quit and reopen = re-authenticate', () => {
  it('does NOT resume once the heartbeat is older than the resume window', () => {
    markSessionAlive(T);
    expect(sessionRecentlyAlive(T + RESUME_WINDOW_MS + 1)).toBe(false);
    // A realistic reopen (minutes later) is firmly stale.
    expect(sessionRecentlyAlive(T + 5 * 60_000)).toBe(false);
  });

  it('resumes exactly at the window edge but not past it', () => {
    markSessionAlive(T);
    expect(sessionRecentlyAlive(T + RESUME_WINDOW_MS)).toBe(true);
    expect(sessionRecentlyAlive(T + RESUME_WINDOW_MS + 1)).toBe(false);
  });
});

describe('cross-tab liveness ping (fallback for a throttled-but-live tab)', () => {
  // The security-critical property: production pings BEFORE it starts its own
  // heartbeat (SessionContext gate runs anyTabAlive() before startHeartbeat()), so
  // a lone fresh tab has no open responder and cannot answer its own ping. This is
  // exactly a full browser quit/reopen -> re-authenticate. (Guards against a
  // regression that opened the responder too early and let a cold start self-resume.)
  it('a tab that has not started its heartbeat cannot self-answer (cold start -> false)', async () => {
    await expect(anyTabAlive(80)).resolves.toBe(false);
  });

  // Mechanism check: a RUNNING heartbeat's responder replies to a ping. In one
  // process this is a same-process reply (two BroadcastChannel instances), so it
  // validates the responder wiring, not cross-tab transport; the cross-tab guarantee
  // rests on the ordering asserted above and below.
  it('a running heartbeat responder answers a ping', async () => {
    if (typeof BroadcastChannel === 'undefined') return;
    startHeartbeat();
    try {
      await expect(anyTabAlive(200)).resolves.toBe(true);
    } finally {
      stopHeartbeat();
    }
  });

  it('once the heartbeat is stopped (sign-out) the responder no longer answers', async () => {
    if (typeof BroadcastChannel === 'undefined') return;
    startHeartbeat();
    stopHeartbeat();                        // sign-out closes the responder
    await expect(anyTabAlive(80)).resolves.toBe(false);
  });
});

describe('robustness', () => {
  it('explicit sign-out (clear) forces re-auth for the next tab', () => {
    markSessionAlive(T);
    clearSessionAlive();
    expect(sessionRecentlyAlive(T + 500)).toBe(false);
  });

  it('ignores a garbage or future timestamp (fails closed)', () => {
    localStorage.setItem('opndoor.session.alive', 'not-a-number');
    expect(sessionRecentlyAlive(T)).toBe(false);
    localStorage.setItem('opndoor.session.alive', String(T + 60_000)); // clock skew / tampering
    expect(sessionRecentlyAlive(T)).toBe(false);
  });
});
