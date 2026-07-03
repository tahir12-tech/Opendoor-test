/* Locks the new commission-reporting maths: the per-partner breakdown must
   reconcile to the blended summary totals, and the agent settlement must
   aggregate at agency level, prior calendar month, net of refunds. Test mode's
   fixed "now" is 2026-06-26, so the prior settlement month is May 2026. */
import { afterAll, describe, expect, it } from 'vitest';
import { ALL_PARTNERS } from '@/data/types';
import { getPeriods, getRatesFor } from '@/data';
import { hydrateFull, type FullApp } from '@/data/applicationsService';
import { liveAggregate, livePartnerBreakdown, getAgentCommissionSettlement } from '@/data/liveAnalytics';

const D = (s: string) => new Date(s);
function app(o: Partial<FullApp> & Pick<FullApp, 'ref' | 'rent' | 'status' | 'partner'>): FullApp {
  return {
    agency: 'Foxglove', branch: 'South Kensington', referrer: 'Priya', owner: 0,
    sentAt: null, paidAt: null, deedAt: null, tenancyStart: null, expiry: null,
    refunded: false, refundedAt: null, refundedAmount: null, refundAfterStart: false,
    deedState: null, deedSentAt: null, deedViewedAt: null, ...o,
  };
}

// Two partners; a refund; some paid in the prior month (May 2026) for settlement.
const APPS: FullApp[] = [
  app({ ref: 'R1', partner: 'rightmove', agency: 'Foxglove', rent: 1000, status: 'paid', paidAt: D('2026-05-04') }),
  app({ ref: 'R2', partner: 'rightmove', agency: 'Marylebone & Co', rent: 2000, status: 'paid', paidAt: D('2026-05-20') }),
  app({ ref: 'R3', partner: 'rightmove', agency: 'Foxglove', rent: 1500, status: 'paid', paidAt: D('2026-05-10'), refunded: true, refundedAt: D('2026-05-12'), refundedAmount: 1500 }),
  app({ ref: 'Z1', partner: 'zoopla', agency: 'Northbank Lettings', rent: 3000, status: 'paid', paidAt: D('2026-04-15') }),
];

hydrateFull(APPS);
afterAll(() => hydrateFull([]));

const allTime = getPeriods().find((p) => p.id === 'alltime')!;

describe('livePartnerBreakdown reconciles to the blended summary', () => {
  const rows = livePartnerBreakdown('superadmin', ALL_PARTNERS, allTime);
  const agg = liveAggregate('superadmin', ALL_PARTNERS, allTime);

  it('net partner + agent commission sum to liveAggregate totals', () => {
    const sumPartnerNet = rows.reduce((s, r) => s + r.partnerCommNet, 0);
    const sumAgentNet = rows.reduce((s, r) => s + r.agentCommNet, 0);
    expect(sumPartnerNet).toBeCloseTo(agg.partnerCommNet, 6);
    expect(sumAgentNet).toBeCloseTo(agg.agentCommNet, 6);
  });

  it('gross includes the refunded fee; net excludes it (per partner)', () => {
    const rm = rows.find((r) => r.partner === 'rightmove')!;
    const rr = getRatesFor('rightmove');
    // R1 + R2 + R3(refunded) gross = 4500; net excludes R3 = 3000.
    expect(rm.feesGross).toBe(4500);
    expect(rm.partnerCommGross).toBeCloseTo(4500 * rr.partner, 6);
    expect(rm.partnerCommNet).toBeCloseTo(3000 * rr.partner, 6);
    expect(rm.agentCommNet).toBeCloseTo(3000 * rr.agent, 6);
  });
});

describe('getAgentCommissionSettlement (prior month, agency level, net)', () => {
  const st = getAgentCommissionSettlement('superadmin', ALL_PARTNERS);

  it('settles May 2026 and aggregates by agency, excluding refunds and other months', () => {
    expect(st.monthLabel).toBe('May 2026');
    // Only Rightmove R1 (Foxglove) and R2 (Marylebone & Co) qualify: R3 refunded,
    // Z1 paid in April. So two agencies, no Foxglove double-count of R3.
    const agencies = st.agencies.map((a) => a.agency).sort();
    expect(agencies).toEqual(['Foxglove', 'Marylebone & Co']);
    const rr = getRatesFor('rightmove');
    const fox = st.agencies.find((a) => a.agency === 'Foxglove')!;
    expect(fox.commission).toBeCloseTo(1000 * rr.agent, 6); // R1 only (R3 refunded)
    expect(fox.apps).toHaveLength(1);
  });
});
