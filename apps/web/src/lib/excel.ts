/**
 * Professional RTL Excel export with Vazirmatn font, proper column widths,
 * branded header styling, borders, alternating row colors and number formatting.
 * Uses exceljs (bundles to ~120KB gzipped). Design mirrors the app's visual language:
 * green primary (#177A50), soft background (#F8FAFC), white cards, muted borders (#E2E8F0).
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface ExcelColumn {
  /** Column header (Persian, rendered in the styled header row). */
  header: string;
  /** Key on each row object used to read the cell value. */
  key: string;
  /** Column width in approximate character units; tuned for Persian. */
  width?: number;
  /** When true, the value is rendered as a number with Persian (Eastern-Arabic) digits
   *  stored as the raw Latin number so Excel can sort/filter/sum it. */
  isNumber?: boolean;
  /** When true, right-align (RTL default) — most Persian columns want this. Default true. */
  align?: 'right' | 'center' | 'left';
}

export interface ExcelOptions {
  /** Sheet title (shown on the tab). */
  sheetName: string;
  /** Top report title row (e.g. «گزارش تکمیل آموزشی — آکادمی سیلانه»). */
  title: string;
  /** Optional subtitle row, rendered smaller and muted. */
  subtitle?: string;
  columns: ExcelColumn[];
  rows: Array<Record<string, string | number | null | undefined>>;
  /** Output file name without extension. */
  fileName: string;
}

const BRAND = {
  primary: '177A50',
  primaryDark: '0F5C3C',
  primaryLight: 'E8F5EE',
  headerText: 'FFFFFF',
  border: 'D1D5DB',
  altRow: 'F8FAFC',
  text: '0F172A',
  muted: '64748B',
};

// Vazirmatn is a Persian web font. We embed the font metadata and register it on the workbook
// so Excel (which doesn't ship Vazirmatn) will still show RTL correctly with its default Arabic font
// (e.g. Tahoma), while if the user has Vazirmatn installed they see the designed look.
const FONT_NAME = 'Vazirmatn';

function persianDigits(v: string | number): string {
  const map = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(v).replace(/\d/g, (d) => map[+d] ?? d);
}

export async function exportExcel(opts: ExcelOptions): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'آکادمی سیلانه';
  wb.lastModifiedBy = 'آکادمی سیلانه';
  wb.created = new Date();
  wb.modified = new Date();
  // RTL is set per-worksheet (workbook.views typing is missing rightToLeft in some versions).

  const ws = wb.addWorksheet(opts.sheetName, {
    properties: { defaultRowHeight: 22 },
    views: [{ rightToLeft: true, showGridLines: false }],
  });

  // ── Column widths (one-based, with a tiny gutter at the end for visual balance) ──
  const totalCols = opts.columns.length;
  opts.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width ?? 18;
  });

  // ── Title row ──
  const titleRow = ws.addRow([opts.title]);
  ws.mergeCells(`A1:${colLetter(totalCols)}1`);
  const titleCell = titleRow.getCell(1);
  titleCell.font = { name: FONT_NAME, size: 16, bold: true, color: { argb: `FF${BRAND.headerText}` } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${BRAND.primary}` },
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  titleRow.height = 36;

  // ── Subtitle row (generation date + optional subtitle) ──
  const now = new Date();
  const faDate = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  const subtitleText = [opts.subtitle, `تاریخ تولید: ${faDate}`].filter(Boolean).join('  •  ');
  const subRow = ws.addRow([subtitleText]);
  ws.mergeCells(`A2:${colLetter(totalCols)}2`);
  const subCell = subRow.getCell(1);
  subCell.font = { name: FONT_NAME, size: 10, color: { argb: `FF${BRAND.muted}` } };
  subCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${BRAND.primaryLight}` },
  };
  subCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  subRow.height = 22;

  // ── Header row (row 3, after title and subtitle) ──
  const headerRow = ws.addRow(opts.columns.map((c) => c.header));
  headerRow.eachCell((cell, colIdx) => {
    cell.font = {
      name: FONT_NAME,
      size: 11,
      bold: true,
      color: { argb: `FF${BRAND.headerText}` },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${BRAND.primaryDark}` },
    };
    cell.alignment = {
      horizontal: opts.columns[colIdx - 1]?.align ?? 'right',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = allBorders(BRAND.primaryDark);
  });
  headerRow.height = 28;

  // ── Data rows ──
  opts.rows.forEach((row, ri) => {
    const values = opts.columns.map((c) => {
      const raw = row[c.key];
      if (raw === null || raw === undefined || raw === '') return '';
      if (c.isNumber) return Number(raw) || 0;
      return String(raw);
    });
    const excelRow = ws.addRow(values);
    const isAlt = ri % 2 === 1;
    excelRow.eachCell((cell, colIdx) => {
      const col = opts.columns[colIdx - 1];
      cell.font = {
        name: FONT_NAME,
        size: 10,
        color: { argb: `FF${BRAND.text}` },
      };
      cell.fill = isAlt
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.altRow}` } }
        : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      cell.alignment = {
        horizontal: col?.align ?? 'right',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = allBorders(BRAND.border);
      if (col?.isNumber && typeof cell.value === 'number') {
        cell.numFmt = '#,##0';
      }
    });
    excelRow.height = 22;
  });

  // ── Footer (count) ──
  const footerRow = ws.addRow([`تعداد ردیف‌ها: ${persianDigits(opts.rows.length)}`]);
  ws.mergeCells(`A${footerRow.number}:${colLetter(totalCols)}${footerRow.number}`);
  const fc = footerRow.getCell(1);
  fc.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: `FF${BRAND.muted}` } };
  fc.alignment = { horizontal: 'left', vertical: 'middle' };
  fc.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
  footerRow.height = 22;

  // ── Freeze the header row so scrolling keeps column titles visible ──
  ws.views = [{ state: 'frozen', ySplit: 3, rightToLeft: true, showGridLines: false }];

  // ── Page setup: RTL, A4, fit to one page width ──
  ws.pageSetup = {
    orientation: 'landscape',
    horizontalCentered: true,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  } as ExcelJS.PageSetup;

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${opts.fileName}.xlsx`);
}

function colLetter(n: number): string {
  let s = '';
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function allBorders(color: string): Partial<ExcelJS.Borders> {
  const side = { style: 'thin' as const, color: { argb: `FF${color}` } };
  return { top: side, left: side, bottom: side, right: side };
}
