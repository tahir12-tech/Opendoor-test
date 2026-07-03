/* Verifies the branded xlsx pipeline actually produces valid workbooks
   (the route smoke test never triggers an export). Run with `npm run smoke`. */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { ALL_PARTNERS, buildApplicationDoc, buildLeagueDoc, buildPerformanceDoc, getSelectedPeriod } from '@/data';
import { buildBrandedWorkbook } from '@/data/xlsxTemplate';

function xlsxBytes(sheets: Parameters<typeof buildBrandedWorkbook>[0]): Uint8Array {
  const wb = buildBrandedWorkbook(sheets);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}
// A .xlsx is a zip, so it starts with the "PK" signature.
function isXlsx(u8: Uint8Array): boolean {
  return u8.length > 500 && u8[0] === 0x50 && u8[1] === 0x4b;
}

const period = getSelectedPeriod();

describe('branded xlsx exports', () => {
  it('performance workbook is a valid branded xlsx', () => {
    const built = buildPerformanceDoc('superadmin', period);
    expect(built.filename).toMatch(/^opndoor-performance-.*\.xlsx$/);
    expect(isXlsx(xlsxBytes(built.sheets))).toBe(true);
    // header band carries the wordmark
    const wb = buildBrandedWorkbook(built.sheets);
    expect(wb.Sheets.Performance.A1?.v).toBe('opndoor');
  });

  it('application workbook honours the basis and the referrer gate', () => {
    expect(buildApplicationDoc('referrer', period, 'referred')).toBeNull();
    const built = buildApplicationDoc('management', period, 'activity');
    expect(built).not.toBeNull();
    expect(built!.filename).toContain('activity');
    expect(isXlsx(xlsxBytes(built!.sheets))).toBe(true);
  });

  it('league workbook has three branded sheets', () => {
    const built = buildLeagueDoc('superadmin', ALL_PARTNERS, '', period);
    expect(built.sheets.map((s) => s.name)).toEqual(['Agencies', 'Branches', 'Referrers']);
    const wb = buildBrandedWorkbook(built.sheets);
    expect(wb.SheetNames).toEqual(['Agencies', 'Branches', 'Referrers']);
    expect(isXlsx(xlsxBytes(built.sheets))).toBe(true);
  });
});
