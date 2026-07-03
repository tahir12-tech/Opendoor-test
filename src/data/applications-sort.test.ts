/* Regression guard for the applications-list "newest first" bug: in live mode the
   list must show ALL scoped records ordered by the real anchor event time
   (deed issued -> paid -> sent) to the second, deterministically, with no mock
   seed rows leaking in and no arbitrary tie order. Run with `npm run smoke`. */
import { describe, expect, it } from 'vitest';
import { ALL_PARTNERS, getApplications, hydrateApplications } from '@/data';
import type { ApplicationSummary } from '@/data';

function row(ref: string, date: string, eventTs: number | undefined, extra: Partial<ApplicationSummary> = {}): ApplicationSummary {
  return {
    ref, tenant: `Tenant ${ref}`, prop: '1 Test St, SW1', branch: 'Test Branch', agency: 'Test Agency',
    ben: '', rent: 1000, status: 'sent', date, eventTs, owner: 1, partner: 'rightmove', ...extra,
  };
}

// Three same-day events (03/07) at distinct times, plus an earlier day, plus a
// tie (identical eventTs) to prove the deterministic ref tie-break.
const t = (h: number, m: number) => new Date(2026, 6, 3, h, m, 0).getTime(); // 03 Jul 2026
const tie = new Date(2026, 6, 1, 0, 0, 0).getTime();                         // 01 Jul 2026 (equal for the tie pair)
const LIST: ApplicationSummary[] = [
  row('GR-20605', '2026-07-03', t(8, 56)),  // paid 08:56
  row('GR-20608', '2026-07-03', t(10, 7)),  // deed 10:07 (newest)
  row('GR-20607', '2026-07-03', t(8, 58)),  // sent 08:58
  row('GR-20604', '2026-07-02', new Date(2026, 6, 2, 18, 49, 0).getTime()),
  row('GR-TIE-B', '2026-07-01', tie),       // same eventTs as TIE-A
  row('GR-TIE-A', '2026-07-01', tie),
];

const opts = { role: 'superadmin' as const, scope: ALL_PARTNERS };

describe('getApplications newest-first ordering', () => {
  hydrateApplications(LIST, []);

  it('orders by real anchor event time to the second (not day-granularity)', () => {
    const refs = getApplications({ ...opts, sort: 'Newest first' }).map((r) => r.ref);
    // 03/07 10:07, 03/07 08:58, 03/07 08:56, 02/07, then the 01/07 tie pair.
    expect(refs.slice(0, 4)).toEqual(['GR-20608', 'GR-20607', 'GR-20605', 'GR-20604']);
  });

  it('breaks exact ties deterministically by reference (never fetch order)', () => {
    const refs = getApplications({ ...opts, sort: 'Newest first' }).map((r) => r.ref);
    const a = refs.indexOf('GR-TIE-A');
    const b = refs.indexOf('GR-TIE-B');
    expect(a).toBeLessThan(b); // 'GR-TIE-A' < 'GR-TIE-B'
  });

  it('shows every scoped record (no rows dropped by pagination-independent sort)', () => {
    expect(getApplications({ ...opts, sort: 'Newest first' })).toHaveLength(LIST.length);
  });

  it('orders "Oldest first" by ascending event time (ties still by ref)', () => {
    const oldest = getApplications({ ...opts, sort: 'Oldest first' }).map((r) => r.ref);
    // The tie pair (equal time) sorts A-before-B in BOTH directions — the ref
    // tie-break is not itself reversed — then ascending by time to the newest last.
    expect(oldest).toEqual(['GR-TIE-A', 'GR-TIE-B', 'GR-20604', 'GR-20605', 'GR-20607', 'GR-20608']);
  });
});
