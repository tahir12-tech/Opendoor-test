/* Guards for the batch fixes:
   - Item 8: an unknown/inaccessible reference yields an honest not-found detail,
     never a substituted record.
   - Item 9: 'Refunded' is a status chip that cross-cuts Paid; counts stay honest
     (All = Sent + Paid + Deed; Refunded counted separately). */
import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_PARTNERS, countByStatus, getApplications, getApplicationDetail, hydrateApplications } from '@/data';
import type { ApplicationSummary } from '@/data';
import type { AppRecord } from '@/data/mock/applications';

function sum(ref: string, status: ApplicationSummary['status'], refunded = false): ApplicationSummary {
  return { ref, tenant: `T ${ref}`, prop: '1 St', branch: 'B', agency: 'A', ben: '', rent: 1000, status, date: '2026-06-01', owner: 1, partner: 'rightmove', refunded };
}
function rec(ref: string): AppRecord {
  return { ref, name: `T ${ref}`, title: 'Mr', role: '', addr1: '1 St', postcode: 'SW1', branch: 'B', agency: 'A', rent: 1000, status: 'paid', date: '2026-06-01', referrer: 'R', owner: 1 };
}

const LIST: ApplicationSummary[] = [
  sum('GR-1', 'sent'), sum('GR-2', 'paid'), sum('GR-3', 'paid', true),
  sum('GR-4', 'deed'), sum('GR-5', 'paid', true),
];
const opts = { role: 'superadmin' as const, scope: ALL_PARTNERS };

describe('countByStatus + refunded chip (item 9)', () => {
  beforeEach(() => hydrateApplications(LIST, []));

  it('counts refunded separately and keeps All = Sent + Paid + Deed', () => {
    const c = countByStatus(opts);
    expect(c).toMatchObject({ all: 5, sent: 1, paid: 3, deed: 1, refunded: 2 });
    expect(c.sent + c.paid + c.deed).toBe(c.all); // refunded is a cross-cut, not additive
  });

  it('the Refunded filter returns only refunded rows (all still Paid by status)', () => {
    const rows = getApplications({ ...opts, status: 'refunded' });
    expect(rows.map((r) => r.ref).sort()).toEqual(['GR-3', 'GR-5']);
    expect(rows.every((r) => r.refunded && r.status === 'paid')).toBe(true);
  });

  it('the Paid filter still includes refunded rows (status is Paid)', () => {
    expect(getApplications({ ...opts, status: 'paid' })).toHaveLength(3);
  });
});

describe('getApplicationDetail honest not-found (item 8)', () => {
  beforeEach(() => hydrateApplications([], [rec('GR-100')]));

  it('flags an unknown reference as not-found without substituting another record', () => {
    const d = getApplicationDetail('GR-999');
    expect(d.notFound).toBe(true);
    expect(d.ref).toBe('GR-999');      // echoes the requested ref, not GR-100
    expect(d.name).toBe('');           // no leaked tenant
  });

  it('returns the real record when the reference exists', () => {
    const d = getApplicationDetail('GR-100');
    expect(d.notFound).toBeFalsy();
    expect(d.ref).toBe('GR-100');
  });

  it('treats a null reference as not-found', () => {
    expect(getApplicationDetail(null).notFound).toBe(true);
  });
});
