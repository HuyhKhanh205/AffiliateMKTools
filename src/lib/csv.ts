import { Conversion, ConversionStatus, Platform } from './types';

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF). Auto-detects `,` `;` or tab. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/**
 * Parses money written either the Vietnamese way ("1.234.567", "12.500,5 ₫")
 * or the English way ("1,234,567.89").
 */
export function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  let s = raw.replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // whichever separator comes last is the decimal separator
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // "1,234,567" (thousands) vs "12,5" (decimal)
    s = s.split(',').length > 2 || /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    // "1.234.567" (VN thousands) vs "12.5" (decimal)
    if (s.split('.').length > 2 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Parses a date like "2026-11-03 14:22:01", "03/11/2026" (dd/mm/yyyy) into YYYY-MM-DD. */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .trim();

/** Header keywords (accent-insensitive) used by Shopee / AccessTrade / TikTok commission exports. */
const COLUMN_HINTS = {
  orderId: ['order id', 'ma don', 'id don hang', 'order_id', 'conversion id'],
  date: ['order time', 'thoi gian dat hang', 'ngay dat', 'purchase time', 'conversion time', 'ngay', 'date', 'time'],
  amount: ['purchase value', 'order amount', 'gia tri don hang', 'gia tri', 'doanh thu', 'amount', 'sale amount'],
  commission: ['total commission', 'tong hoa hong', 'hoa hong', 'commission', 'reward', 'pub_commission'],
  status: ['order status', 'trang thai', 'status'],
};

function findColumn(headers: string[], hints: string[]): number {
  const normalized = headers.map(strip);
  for (const hint of hints) {
    const idx = normalized.findIndex((h) => h === hint);
    if (idx >= 0) return idx;
  }
  for (const hint of hints) {
    const idx = normalized.findIndex((h) => h.includes(hint));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function mapStatus(raw: string | undefined): ConversionStatus {
  const s = strip(raw ?? '');
  if (/(huy|reject|cancel|invalid|tu choi|khong hop le)/.test(s)) return 'rejected';
  if (/(approved|completed|hoan thanh|da duyet|thanh cong|paid|da thanh toan|valid)/.test(s)) return 'approved';
  return 'pending';
}

export interface CsvImportResult {
  conversions: Conversion[];
  skipped: number;
  missingColumns: string[];
}

/** Converts a commission report CSV into conversion rows for one platform. */
export function conversionsFromCsv(text: string, platform: Platform): CsvImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { conversions: [], skipped: 0, missingColumns: ['header'] };
  const [headers, ...data] = rows;
  const col = {
    orderId: findColumn(headers, COLUMN_HINTS.orderId),
    date: findColumn(headers, COLUMN_HINTS.date),
    amount: findColumn(headers, COLUMN_HINTS.amount),
    commission: findColumn(headers, COLUMN_HINTS.commission),
    status: findColumn(headers, COLUMN_HINTS.status),
  };
  const missingColumns = (['date', 'commission'] as const).filter((k) => col[k] < 0);
  if (missingColumns.length) return { conversions: [], skipped: data.length, missingColumns };

  const conversions: Conversion[] = [];
  let skipped = 0;
  for (const r of data) {
    const date = parseDate(r[col.date]);
    if (!date) {
      skipped++;
      continue;
    }
    conversions.push({
      platform,
      external_order_id: col.orderId >= 0 ? r[col.orderId]?.trim() || null : null,
      order_date: date,
      order_amount: col.amount >= 0 ? parseNumber(r[col.amount]) : 0,
      commission: parseNumber(r[col.commission]),
      status: col.status >= 0 ? mapStatus(r[col.status]) : 'pending',
      source: 'csv',
    });
  }
  return { conversions, skipped, missingColumns: [] };
}
