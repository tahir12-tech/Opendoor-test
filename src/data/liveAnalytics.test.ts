/* Locks the LIVE analytics maths (the smoke suite otherwise only exercises the
   synthetic mock path, since SUPABASE_ENABLED is false in test mode). We hydrate
   a known FullApp set and assert the aggregate, league and volume figures. The
   period window uses the fixed demo "now" (2026-06-26) in test mode. */
import { afterAll, describe, expect, it } from 'vitest';
import { ALL_PARTNERS } from '@/data/types';
import { getPeriods, getRatesFor } from '@/data';
import { hydrateFull, type FullApp } from '@/data/applicationsService';
import { liveAggregate, liveLeague } from '@/data/liveAnalytics';

const D = (s: string) => new Date(s);
function app(o: Partial<FullApp> & Pick<FullApp, 'ref' | 'rent' | 'status'>): FullApp {
  return {
    partner: 'rightmove', agency: 'Foxglove', branch: 'South Kensington', referrer: 'Priya', owner: 0,
    sentAt: null, paidAt: null, deedAt: null, tenancyStart: null, expiry: null,
    refunded: false, refundedAt: null, refundedAmount: null, refundAfterStart: false,
    deedState: null, deedSentAt: null, deedViewedAt: null, ...o,
  };
}

// All dates inside the all-time window [2024-09-01 .. 2026-06-26].
const APPS: FullApp[] = [
  app({ ref: 'A', rent: 1000, status: 'deed', owner: 1, agency: 'Foxglove', branch: 'South Kensington', referrer: 'Priya', sentAt: D('2026-01-10'), paidAt: D('2026-01-12'), deedAt: D('2026-01-15'), deedState: 'executed' }),
  app({ ref: 'B', rent: 2000, status: 'paid', owner: 0, agency: 'Foxglove', branch: 'Chelsea', referrer: 'James', sentAt: D('2026-02-01'), paidAt: D('2026-02-03'), deedState: 'awaiting_tenant', deedSentAt: D('2026-02-03') }),
  app({ ref: 'C', rent: 1500, status: 'paid', owner: 0, agency: 'Marylebone', branch: 'Marylebone', referrer: 'Sophie', sentAt: D('2026-03-01'), paidAt: D('2026-03-05'), refunded: true, refundedAt: D('2026-03-10'), refundedAmount: 1500 }),
  app({ ref: 'D', rent: 1800, status: 'sent', owner: 1, agency: 'Foxglove', branch: 'South Kensington', referrer: 'Priya', sentAt: D('2026-06-01') }),
];

hydrateFull(APPS);
afterAll(() => hydrateFull([]));

const allTime = getPeriods().find((p) => p.id === 'alltime')!;
const rates = getRatesFor('rightmove');

describe('liveAggregate (event-in-period, net of refunds)', () => {
  const a = liveAggregate('superadmin', ALL_PARTNERS, allTime);
  it('counts each funnel stage by its own event date', () => {
    expect(a.sent).toBe(4);
    expect(a.paid).toBe(3); // A, B, C paid in window
    expect(a.deed).toBe(1); // A
  });
  it('sums fees gross/net and refunds', () => {
    expect(a.feesGross).toBe(4500);
    expect(a.refundCount).toBe(1);
    expect(a.refundValue).toBe(1500);
    expect(a.feesNet).toBe(3000);
  });
  it('guaranteed value = annualised rent over deeds issued in period', () => {
    expect(a.guaranteed).toBe(12000); // 1000 * 12
  });
  it('commission is net of refunds, per-partner rates', () => {
    expect(a.partnerCommNet).toBeCloseTo(3000 * rates.partner, 6);
    expect(a.agentCommNet).toBeCloseTo(3000 * rates.agent, 6);
    expect(a.partnerCommExcl).toBeCloseTo(1500 * rates.partner, 6);
  });
  it('operational metrics (current state)', () => {
    expect(a.stuckSent).toBe(1); // D
    expect(a.stuckPaid).toBe(1); // B (C is refunded, excluded)
    expect(a.awaiting).toBe(1); // B
    expect(a.awaitingAged).toBe(1); // B sent > 7 days before now
    expect(a.avgRent).toBeCloseTo(6300 / 4, 6);
  });
});

describe('liveLeague', () => {
  it('groups agencies by fees, with net commission columns', () => {
    const rows = liveLeague('agency', 'superadmin', ALL_PARTNERS, '', allTime);
    expect(rows.map((r) => r.name)).toEqual(['Foxglove', 'Marylebone']);
    const fox = rows[0];
    expect(fox.refs).toBe(3); // A, B, D sent in window
    expect(fox.paid).toBe(2); // A, B
    expect(fox.deed).toBe(1); // A
    expect(fox.fees).toBe(3000); // A(1000) + B(2000)
    expect(fox.partnerComm).toBeCloseTo(3000 * rates.partner, 6); // Foxglove has no refunds
    const mar = rows[1];
    expect(mar.fees).toBe(1500);
    expect(mar.partnerComm).toBeCloseTo(0, 6); // 1500 paid - 1500 refunded = 0 net
  });

  it('a referrer sees only their own applications', () => {
    const rows = liveLeague('referrer', 'referrer', ALL_PARTNERS, '', allTime);
    // Owner===1 apps are A and D, both referrer "Priya" -> one row, refs=2
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Priya');
    expect(rows[0].refs).toBe(2);
    expect(rows[0].paid).toBe(1); // only A paid
  });
});
