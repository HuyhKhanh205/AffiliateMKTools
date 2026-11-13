import { Channel, Conversion, DailyClickRow, Platform } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh has no DST

/** Calendar day (YYYY-MM-DD) in Vietnam time — matches the `daily_clicks` view in SQL. */
export function vnDay(date: Date): string {
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** The last `n` Vietnam calendar days ending at `now`, oldest first. */
export function lastDays(now: Date, n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) days.push(vnDay(new Date(now.getTime() - i * DAY_MS)));
  return days;
}

export interface ClickSummary {
  today: number;
  last7: number;
  last30: number;
  byPlatform: Partial<Record<Platform, number>>;
  byChannel: Partial<Record<Channel, number>>;
  topProducts: { productId: string; clicks: number }[];
  series: { day: string; clicks: number }[]; // last 14 days, oldest first
}

/** Aggregates `daily_clicks` rows (last 30 days) into dashboard numbers. */
export function summarizeClicks(rows: DailyClickRow[], now: Date): ClickSummary {
  const days30 = new Set(lastDays(now, 30));
  const days7 = new Set(lastDays(now, 7));
  const today = vnDay(now);
  const seriesDays = lastDays(now, 14);
  const perDay = new Map<string, number>();
  const perProduct = new Map<string, number>();
  const summary: ClickSummary = {
    today: 0,
    last7: 0,
    last30: 0,
    byPlatform: {},
    byChannel: {},
    topProducts: [],
    series: [],
  };

  for (const row of rows) {
    if (!days30.has(row.day)) continue;
    const n = Number(row.clicks) || 0;
    summary.last30 += n;
    if (days7.has(row.day)) summary.last7 += n;
    if (row.day === today) summary.today += n;
    summary.byPlatform[row.platform] = (summary.byPlatform[row.platform] ?? 0) + n;
    summary.byChannel[row.channel] = (summary.byChannel[row.channel] ?? 0) + n;
    perDay.set(row.day, (perDay.get(row.day) ?? 0) + n);
    perProduct.set(row.product_id, (perProduct.get(row.product_id) ?? 0) + n);
  }

  summary.series = seriesDays.map((day) => ({ day, clicks: perDay.get(day) ?? 0 }));
  summary.topProducts = [...perProduct.entries()]
    .map(([productId, clicks]) => ({ productId, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);
  return summary;
}

export interface EarningsSummary {
  orders: number;
  revenue: number;
  approved: number;
  pending: number;
  rejected: number;
  byPlatform: Partial<Record<Platform, number>>; // approved + pending commission
}

export function summarizeEarnings(conversions: Conversion[]): EarningsSummary {
  const s: EarningsSummary = { orders: 0, revenue: 0, approved: 0, pending: 0, rejected: 0, byPlatform: {} };
  for (const c of conversions) {
    s.orders += 1;
    s.revenue += c.order_amount;
    s[c.status] += c.commission;
    if (c.status !== 'rejected') {
      s.byPlatform[c.platform] = (s.byPlatform[c.platform] ?? 0) + c.commission;
    }
  }
  return s;
}

/** Claude Haiku 5.5 list price (USD per 1M tokens), prompts up to 100K tokens. */
export const AI_PRICE_PER_MTOK = { input: 0.1, output: 0.5 };

export function estimateAiCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * AI_PRICE_PER_MTOK.input + outputTokens * AI_PRICE_PER_MTOK.output) / 1_000_000;
}

/** Earnings per click — the key number for deciding which products/channels to push. */
export function earningsPerClick(commission: number, clicks: number): number | null {
  return clicks > 0 ? commission / clicks : null;
}
