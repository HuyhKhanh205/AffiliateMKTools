import { conversionsFromCsv, mapStatus, parseCsv, parseDate, parseNumber } from '../csv';
import { buildTrackedUrl, generateSlug, shortLinkBase } from '../links';
import { detectPlatform, formatVnd, normalizeUrl } from '../platform';
import { earningsPerClick, estimateAiCostUsd, lastDays, summarizeClicks, summarizeEarnings, vnDay } from '../stats';
import { DailyClickRow } from '../types';

describe('platform', () => {
  it.each([
    ['https://shopee.vn/Ao-thun-i.123.456', 'shopee'],
    ['s.shopee.vn/AbCdEf', 'shopee'],
    ['https://shp.ee/xyz', 'shopee'],
    ['https://www.lazada.vn/products/abc-i1.html', 'lazada'],
    ['https://c.lazada.vn/t/c.abc', 'lazada'],
    ['https://tiki.vn/sach-dac-nhan-tam-p123.html', 'tiki'],
    ['https://vt.tiktok.com/ZSabc/', 'tiktok'],
    ['https://shop.tiktok.com/view/product/1729', 'tiktok'],
    ['https://example.com/shopee.vn', null],
    ['https://notshopee.vn/x', null],
    ['not a url', null],
  ])('detectPlatform(%s) = %s', (url, expected) => {
    expect(detectPlatform(url)).toBe(expected);
  });

  it('normalizes urls', () => {
    expect(normalizeUrl('  tiki.vn/abc ')).toBe('https://tiki.vn/abc');
    expect(normalizeUrl('')).toBeNull();
  });

  it('formats VND', () => {
    expect(formatVnd(125000)).toMatch(/^125.000đ$/);
    expect(formatVnd(null)).toBe('—');
  });
});

describe('links', () => {
  it('generates slugs of the requested length from the safe alphabet', () => {
    const slug = generateSlug(9);
    expect(slug).toHaveLength(9);
    expect(slug).toMatch(/^[a-km-np-z2-9]+$/);
    expect(generateSlug(3, () => 0)).toBe('aaa');
  });

  it('builds the short link base', () => {
    expect(shortLinkBase('https://abc.supabase.co/', undefined)).toBe('https://abc.supabase.co/functions/v1/go');
    expect(shortLinkBase('https://abc.supabase.co', 'https://go.example.com/')).toBe('https://go.example.com');
    expect(buildTrackedUrl('https://go.example.com', 'ab12cd')).toBe('https://go.example.com/ab12cd');
  });
});

describe('stats', () => {
  const now = new Date('2026-11-13T03:00:00Z'); // 10:00 in Vietnam

  it('uses Vietnam calendar days', () => {
    expect(vnDay(new Date('2026-11-12T18:00:00Z'))).toBe('2026-11-13');
    expect(lastDays(now, 3)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
  });

  it('summarizes clicks', () => {
    const rows: DailyClickRow[] = [
      { day: '2026-11-13', product_id: 'a', platform: 'shopee', channel: 'tiktok', clicks: 5 },
      { day: '2026-11-10', product_id: 'b', platform: 'tiki', channel: 'bio', clicks: 3 },
      { day: '2026-10-20', product_id: 'a', platform: 'shopee', channel: 'facebook', clicks: 2 },
      { day: '2026-09-01', product_id: 'a', platform: 'shopee', channel: 'facebook', clicks: 100 },
    ];
    const s = summarizeClicks(rows, now);
    expect(s.today).toBe(5);
    expect(s.last7).toBe(8);
    expect(s.last30).toBe(10);
    expect(s.byPlatform).toEqual({ shopee: 7, tiki: 3 });
    expect(s.byChannel).toEqual({ tiktok: 5, bio: 3, facebook: 2 });
    expect(s.topProducts[0]).toEqual({ productId: 'a', clicks: 7 });
    expect(s.series).toHaveLength(14);
    expect(s.series[13]).toEqual({ day: '2026-11-13', clicks: 5 });
  });

  it('summarizes earnings', () => {
    const s = summarizeEarnings([
      { platform: 'shopee', external_order_id: '1', order_date: '2026-11-01', order_amount: 200000, commission: 10000, status: 'approved', source: 'manual' },
      { platform: 'shopee', external_order_id: '2', order_date: '2026-11-02', order_amount: 100000, commission: 5000, status: 'pending', source: 'manual' },
      { platform: 'lazada', external_order_id: '3', order_date: '2026-11-02', order_amount: 50000, commission: 2000, status: 'rejected', source: 'csv' },
    ]);
    expect(s).toMatchObject({ orders: 3, revenue: 350000, approved: 10000, pending: 5000, rejected: 2000 });
    expect(s.byPlatform).toEqual({ shopee: 15000 });
  });

  it('estimates AI cost and EPC', () => {
    expect(estimateAiCostUsd(1_000_000, 1_000_000)).toBeCloseTo(0.6);
    expect(earningsPerClick(10000, 0)).toBeNull();
    expect(earningsPerClick(10000, 50)).toBe(200);
  });
});

describe('csv', () => {
  it('parses quoted fields, escaped quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it.each([
    ['1.234.567', 1234567],
    ['12.500 ₫', 12500],
    ['12.500,5', 12500.5],
    ['1,234,567.89', 1234567.89],
    ['12,5', 12.5],
    ['15000', 15000],
    ['12.5', 12.5],
    ['', 0],
  ])('parseNumber(%s) = %s', (raw, expected) => {
    expect(parseNumber(raw)).toBeCloseTo(expected);
  });

  it('parses dates', () => {
    expect(parseDate('2026-11-03 14:22:01')).toBe('2026-11-03');
    expect(parseDate('3/11/2026')).toBe('2026-11-03');
    expect(parseDate('hôm qua')).toBeNull();
  });

  it('maps statuses', () => {
    expect(mapStatus('Hoàn thành')).toBe('approved');
    expect(mapStatus('Đã hủy')).toBe('rejected');
    expect(mapStatus('Đang chờ xử lý')).toBe('pending');
  });

  it('imports a Shopee-style commission report', () => {
    const csv = [
      'Order ID,Order Status,Order Time,Purchase Value(₫),Total Commission(₫)',
      '2611A,Completed,2026-11-03 10:00:00,"250.000","12.500"',
      '2611B,Cancelled,2026-11-04 11:00:00,100.000,5.000',
      '2611C,Pending,bad-date,1,1',
    ].join('\n');
    const result = conversionsFromCsv(csv, 'shopee');
    expect(result.skipped).toBe(1);
    expect(result.conversions).toEqual([
      { platform: 'shopee', external_order_id: '2611A', order_date: '2026-11-03', order_amount: 250000, commission: 12500, status: 'approved', source: 'csv' },
      { platform: 'shopee', external_order_id: '2611B', order_date: '2026-11-04', order_amount: 100000, commission: 5000, status: 'rejected', source: 'csv' },
    ]);
  });

  it('imports a Vietnamese-header report', () => {
    const csv = 'Mã đơn;Trạng thái;Ngày đặt;Giá trị đơn hàng;Hoa hồng\nX1;Đã duyệt;05/11/2026;1.000.000;45.000';
    const result = conversionsFromCsv(csv, 'lazada');
    expect(result.conversions[0]).toMatchObject({ external_order_id: 'X1', order_date: '2026-11-05', order_amount: 1000000, commission: 45000, status: 'approved' });
  });

  it('reports missing columns', () => {
    expect(conversionsFromCsv('foo,bar\n1,2', 'tiki').missingColumns).toEqual(['date', 'commission']);
  });
});
