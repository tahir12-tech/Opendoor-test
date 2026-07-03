/* =====================================================================
   Activity service — the consolidated activity feed and the upcoming-expiry
   read model, both scoped by role and partner (Referrers see their own,
   Management their partner's estate, opndoor admin everything).

   INTEGRATION:
   - getActivity: today it derives events from the mock applications. In
     production this is a GET of an events table (referral sent, fee paid,
     deed issued) filtered to the caller's scope.
   - getUpcomingExpiries: today it reads the in-force guarantees seed. In
     production it queries live guarantees and derives expiry with
     guaranteeExpiry (tenancy start + 12 months - 1 day).
   ===================================================================== */
import type { ActivityEntry, ActivityKind, ExpiryBand, PartnerScope, Role, UpcomingExpiry } from './types';
import { ALL_PARTNERS } from './types';
import { UPCOMING_GUARANTEES, type UpcomingGuaranteeSeed } from './mock/guarantees';
import { allSummaries, guaranteeExpiry } from './applicationsService';
import { SUPABASE_ENABLED } from '@/lib/supabase';

const DAY = 86400000;

// The demo "today" keeps the mock/test banding deterministic. In Supabase mode
// the real current date is used (the reminder job below also runs on real dates).
const DEMO_TODAY = new Date(2026, 5, 26);
function today(): Date {
  return SUPABASE_ENABLED ? new Date() : DEMO_TODAY;
}

// In-force guarantees approaching expiry. Seeded from the mock; replaced from
// Supabase after login (the near-term deed applications).
let UPCOMING: UpcomingGuaranteeSeed[] = UPCOMING_GUARANTEES;

/** Replace the upcoming-expiries source from the back end (Supabase mode). */
export function hydrateUpcoming(rows: UpcomingGuaranteeSeed[]): void {
  UPCOMING = rows.slice();
}

export interface ActivityScope {
  role: Role;
  scope: PartnerScope;
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY);
}

/** Role + partner isolation (mirrors the applications list rule). */
function inScope(opts: ActivityScope, row: { partner: string; owner: number }): boolean {
  if (opts.scope !== ALL_PARTNERS && row.partner !== opts.scope) return false;
  if (opts.role === 'referrer' && !row.owner) return false;
  return true;
}

/**
 * Consolidated, most-recent-first activity feed: referrals sent, guarantor
 * fees paid and deeds issued across the caller's scope. Event dates are
 * derived deterministically from each application's latest status, the same
 * way the application detail view does.
 */
export function getActivity(opts: ActivityScope): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  allSummaries().filter((r) => inScope(opts, r)).forEach((r) => {
    const event = parseISO(r.date);
    let sentAt: Date;
    let paidAt: Date | null = null;
    let deedAt: Date | null = null;
    if (r.status === 'deed') {
      deedAt = event;
      paidAt = addDays(event, -2);
      sentAt = addDays(event, -6);
    } else if (r.status === 'paid') {
      paidAt = event;
      sentAt = addDays(event, -4);
    } else {
      sentAt = event;
    }
    const base = { ref: r.ref, tenant: r.tenant, prop: r.prop, branch: r.branch, agency: r.agency, partner: r.partner };
    const add = (kind: ActivityKind, at: Date) => entries.push({ id: `${r.ref}-${kind}`, kind, at, ...base });
    add('sent', sentAt);
    if (paidAt) add('paid', paidAt);
    if (deedAt) add('deed', deedAt);
  });
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

function bandFor(daysUntil: number): ExpiryBand {
  if (daysUntil <= 7) return 'soon';
  if (daysUntil <= 14) return 'warn';
  if (daysUntil <= 30) return 'notice';
  return 'later';
}

/**
 * Guarantees approaching expiry in the caller's scope, soonest first. Expiry
 * comes from guaranteeExpiry (tenancy start + 12 months - 1 day), so this view
 * and the reminder job below cannot drift.
 *
 * INTEGRATION (scheduled back-end job, NOT the front end): proactive expiry
 * reminders cannot run from the browser, which is not open when they are due.
 * A Supabase scheduled function (pg_cron / Edge Function on a daily cron) must:
 *   1. Run once every day.
 *   2. For each in-force guarantee compute expiry = guaranteeExpiry(tenancy
 *      start) and daysUntil = expiry - today.
 *   3. Fire a reminder as daysUntil crosses each threshold: 30, 14, 7, then
 *      every day from 7 down to 0 (daily in the final week), recording which
 *      thresholds were already sent so each fires exactly once.
 *   4. Deliver the notification (in-app + email) to the referrer, the
 *      partner's management and opndoor, whether or not anyone has the app open.
 * getUpcomingExpiries is the shared read model for that job and this page.
 */
export function getUpcomingExpiries(opts: ActivityScope): UpcomingExpiry[] {
  const now = today();
  return UPCOMING.filter((g) => inScope(opts, g))
    .map((g) => {
      const expiry = guaranteeExpiry(parseISO(g.tenancyStart));
      const daysUntil = Math.round((expiry.getTime() - now.getTime()) / DAY);
      return { ref: g.ref, tenant: g.tenant, prop: g.prop, branch: g.branch, agency: g.agency, partner: g.partner, expiry, daysUntil, band: bandFor(daysUntil) };
    })
    .filter((e) => e.daysUntil >= 0) // upcoming only
    .sort((a, b) => a.expiry.getTime() - b.expiry.getTime());
}
