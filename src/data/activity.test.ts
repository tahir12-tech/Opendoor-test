/* Verifies the activity feed ordering and the scoped, banded, sorted
   upcoming-expiries read model. Run with `npm run smoke`. */
import { describe, expect, it } from 'vitest';
import { ALL_PARTNERS, getActivity, getUpcomingExpiries } from '@/data';

describe('getActivity', () => {
  it('is sorted most-recent first for opndoor admin', () => {
    const feed = getActivity({ role: 'superadmin', scope: ALL_PARTNERS });
    expect(feed.length).toBeGreaterThan(0);
    for (let i = 1; i < feed.length; i++) {
      expect(feed[i - 1].at.getTime()).toBeGreaterThanOrEqual(feed[i].at.getTime());
    }
  });

  it('scopes a Referrer to their own referrals', () => {
    const feed = getActivity({ role: 'referrer', scope: 'rightmove' });
    const all = getActivity({ role: 'superadmin', scope: ALL_PARTNERS });
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.length).toBeLessThan(all.length);
  });
});

describe('getUpcomingExpiries', () => {
  it('is sorted soonest first and only upcoming', () => {
    const list = getUpcomingExpiries({ role: 'superadmin', scope: ALL_PARTNERS });
    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].expiry.getTime()).toBeLessThanOrEqual(list[i].expiry.getTime());
    }
    expect(list.every((e) => e.daysUntil >= 0)).toBe(true);
  });

  it('populates every urgency band for opndoor admin', () => {
    const list = getUpcomingExpiries({ role: 'superadmin', scope: ALL_PARTNERS });
    const bands = new Set(list.map((e) => e.band));
    expect(bands.has('soon')).toBe(true);
    expect(bands.has('warn')).toBe(true);
    expect(bands.has('notice')).toBe(true);
  });

  it('scopes a Referrer to their own guarantees', () => {
    const mine = getUpcomingExpiries({ role: 'referrer', scope: 'rightmove' });
    const all = getUpcomingExpiries({ role: 'superadmin', scope: ALL_PARTNERS });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.length).toBeLessThan(all.length);
  });
});
