/* Pins the single guarantee-expiry rule: tenancy start + 12 months - 1 day,
   always from the tenancy start. Run with `npm run smoke`. */
import { describe, expect, it } from 'vitest';
import { amendTenancyStart, guaranteeExpiry } from '@/data';

const dmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const parse = (s: string) => {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
};

// [tenancy start, expected expiry]
const CASES: [string, string][] = [
  ['15/06/2026', '14/06/2027'],
  ['01/01/2026', '31/12/2026'],
  ['01/06/2026', '31/05/2027'],
  ['30/09/2025', '29/09/2026'],
  ['31/12/2026', '30/12/2027'],
  ['29/02/2024', '28/02/2025'], // leap-year start
];

describe('guaranteeExpiry (tenancy start + 12 months - 1 day)', () => {
  it.each(CASES)('tenancy start %s gives expiry %s', (start, expected) => {
    expect(dmy(guaranteeExpiry(parse(start)))).toBe(expected);
  });

  it('reissue on a Paid/Deed application recomputes expiry from the new start', () => {
    const res = amendTenancyStart('deed', parse('15/06/2026'));
    expect(res.reissued).toBe(true);
    expect(res.expiry && dmy(res.expiry)).toBe('14/06/2027');
  });
});
