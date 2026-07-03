/* =====================================================================
   Branded .xlsx template: one shared styling helper for every human-facing
   export (Performance, Application, League). Produces opndoor-branded
   workbooks: a deep-purple (Valhalla) header band with the wordmark, the
   brand fonts (Sora for titles, Manrope for data), a heliotrope accent on
   column headers, a metadata line, and tabular number/currency formats.

   Library note: this uses `xlsx-js-style`, which is the SheetJS `xlsx` API
   with cell-style support. The community `xlsx` writer drops cell styles, so
   a style-capable build of the same API is required for branding.

   INTEGRATION: the wordmark is styled text in the header band. A real logo
   image could be embedded later (xlsx image embedding needs media parts and
   a drawing relationship, which SheetJS does not write); styled text is the
   reliable path for now. When the back end generates these, feed it the same
   BrandedDoc blocks so the format stays identical.
   ===================================================================== */
import * as XLSX from 'xlsx-js-style';

/* ---- brand tokens (from portal.css :root) ---- */
const VALHALLA = '271D5F';
const HELIOTROPE_DEEP = 'B54DE0';
const WHITE_LILAC = 'F8EFF9';
const INK = '271D5F';
const INK_SOFT = '5B4D86';
const WHITE = 'FFFFFF';

// Brand fonts; Excel falls back gracefully when they are not installed.
const FONT_DISPLAY = 'Sora'; // titles and headings
const FONT_BODY = 'Manrope'; // data rows

/* ---- number formats ---- */
const FMT_INT = '#,##0';
const FMT_MONEY = '"£"#,##0';
const FMT_PCT = '0%';

type Style = Record<string, unknown>;
interface XCell {
  v: string | number;
  t: 's' | 'n';
  s: Style;
}

const bandStyle: Style = { fill: { patternType: 'solid', fgColor: { rgb: VALHALLA } }, font: { name: FONT_DISPLAY, bold: true, sz: 18, color: { rgb: WHITE } }, alignment: { vertical: 'center', horizontal: 'left' } };
const titleStyle: Style = { font: { name: FONT_DISPLAY, bold: true, sz: 14, color: { rgb: INK } }, alignment: { vertical: 'center' } };
const metaStyle: Style = { font: { name: FONT_BODY, sz: 10, color: { rgb: INK_SOFT } }, alignment: { vertical: 'center' } };
const sectionStyle: Style = { font: { name: FONT_DISPLAY, bold: true, sz: 11, color: { rgb: INK } } };
const labelStyle: Style = { font: { name: FONT_BODY, bold: true, sz: 10, color: { rgb: INK } } };
const textStyle: Style = { font: { name: FONT_BODY, sz: 10, color: { rgb: INK } } };
const headStyle: Style = { fill: { patternType: 'solid', fgColor: { rgb: WHITE_LILAC } }, font: { name: FONT_BODY, bold: true, sz: 10, color: { rgb: INK } }, alignment: { vertical: 'center' }, border: { bottom: { style: 'medium', color: { rgb: HELIOTROPE_DEEP } } } };
const headNumStyle: Style = { ...headStyle, alignment: { vertical: 'center', horizontal: 'right' } };
function numStyle(fmt: string): Style {
  return { font: { name: FONT_BODY, sz: 10, color: { rgb: INK } }, alignment: { horizontal: 'right' }, numFmt: fmt };
}

function tCell(v: string, s: Style = textStyle): XCell {
  return { v: v ?? '', t: 's', s };
}
function nCell(v: number, fmt: string): XCell {
  return { v: Number.isFinite(v) ? v : 0, t: 'n', s: numStyle(fmt) };
}
function fmtFor(type: ColType): string {
  return type === 'money' ? FMT_MONEY : type === 'pct' ? FMT_PCT : FMT_INT;
}
function defaultWidth(type: ColType): number {
  return type === 'text' ? 22 : type === 'money' ? 16 : 12;
}

/* ---- declarative document model (shared by all exports) ---- */
export type ColType = 'text' | 'int' | 'money' | 'pct';
export interface Column {
  header: string;
  type: ColType;
  width?: number;
}
/** A table row: values matching the columns; a pct value is a fraction (0..1). */
export type TableRow = (string | number)[];
export interface KeyValue {
  label: string;
  value: string | number;
  /** Number format when value is numeric; omitted means render as text. */
  type?: Exclude<ColType, 'text'>;
}
export type Block =
  | { kind: 'section'; title: string }
  | { kind: 'keyvalue'; items: KeyValue[] }
  | { kind: 'table'; columns: Column[]; rows: TableRow[] }
  | { kind: 'blank' };

export interface BrandedDoc {
  /** Report name shown as the title under the header band. */
  reportName: string;
  /** Period, scope, partner and generated date, on one line. */
  metaLine: string;
  blocks: Block[];
}

/** Build one branded worksheet from a declarative document. */
export function buildBrandedSheet(doc: BrandedDoc): XLSX.WorkSheet {
  let ncols = 2;
  doc.blocks.forEach((b) => {
    if (b.kind === 'table') ncols = Math.max(ncols, b.columns.length);
  });

  const grid: (XCell | null)[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const colWidths: number[] = [];

  // header band + wordmark, then title, metadata and a spacer row
  const band: (XCell | null)[] = [];
  for (let c = 0; c < ncols; c++) band.push({ v: c === 0 ? 'opndoor' : '', t: 's', s: bandStyle });
  grid.push(band);
  grid.push([{ v: doc.reportName, t: 's', s: titleStyle }]);
  grid.push([{ v: doc.metaLine, t: 's', s: metaStyle }]);
  grid.push([]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: ncols - 1 } });
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: ncols - 1 } });

  doc.blocks.forEach((b) => {
    if (b.kind === 'blank') {
      grid.push([]);
      return;
    }
    if (b.kind === 'section') {
      grid.push([{ v: b.title, t: 's', s: sectionStyle }]);
      return;
    }
    if (b.kind === 'keyvalue') {
      colWidths[0] = Math.max(colWidths[0] ?? 10, 36);
      colWidths[1] = Math.max(colWidths[1] ?? 10, 18);
      b.items.forEach((it) => {
        const value = typeof it.value === 'number' && it.type ? nCell(it.value, fmtFor(it.type)) : tCell(String(it.value));
        grid.push([tCell(it.label, labelStyle), value]);
      });
      return;
    }
    // table
    grid.push(b.columns.map((col): XCell => ({ v: col.header, t: 's', s: col.type === 'text' ? headStyle : headNumStyle })));
    b.rows.forEach((r) => {
      grid.push(r.map((val, ci): XCell => {
        const col = b.columns[ci];
        return col.type === 'text' ? tCell(String(val)) : nCell(Number(val), fmtFor(col.type));
      }));
    });
    b.columns.forEach((col, ci) => {
      colWidths[ci] = Math.max(colWidths[ci] ?? 10, col.width ?? defaultWidth(col.type));
    });
  });

  // assemble the worksheet
  const ws: Record<string, unknown> = {};
  let maxC = ncols - 1;
  grid.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (!cell) return;
      ws[XLSX.utils.encode_cell({ r, c })] = cell;
      if (c > maxC) maxC = c;
    }),
  );
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: grid.length - 1, c: maxC } });
  const cols: { wch: number }[] = [];
  for (let c = 0; c <= maxC; c++) cols.push({ wch: c === 0 ? Math.max(colWidths[0] ?? 26, 26) : colWidths[c] ?? 14 });
  ws['!cols'] = cols;
  ws['!merges'] = merges;
  ws['!rows'] = [{ hpt: 30 }]; // taller header band row
  return ws as unknown as XLSX.WorkSheet;
}

/** Build a branded workbook from one or more named sheets. */
export function buildBrandedWorkbook(sheets: { name: string; doc: BrandedDoc }[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, doc }) => XLSX.utils.book_append_sheet(wb, buildBrandedSheet(doc), name));
  return wb;
}

/** Trigger a browser download of a workbook as .xlsx. */
export function downloadXlsx(wb: XLSX.WorkBook, filename: string): void {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export type { XLSX };
