import { Platform } from './types';

export const PLATFORM_LABELS: Record<Platform, string> = {
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiki: 'Tiki',
  tiktok: 'TikTok Shop',
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  shopee: '#EE4D2D',
  lazada: '#0F146D',
  tiki: '#1A94FF',
  tiktok: '#111111',
};

/** Domain suffixes for each platform, including their short-link domains. */
const DOMAINS: Record<Platform, string[]> = {
  shopee: ['shopee.vn', 'shp.ee', 'shope.ee', 'shopee.com'],
  lazada: ['lazada.vn', 'lzd.co', 'lazada.com'],
  tiki: ['tiki.vn', 'ti.ki'],
  tiktok: ['tiktok.com', 'tiktokshop.com', 'tiktokglobalshop.com'],
};

/** Normalizes user input (trims, adds https:// if the scheme is missing). Returns null if not a URL. */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Detects which marketplace a product/affiliate URL belongs to. */
export function detectPlatform(input: string): Platform | null {
  const normalized = normalizeUrl(input);
  if (!normalized) return null;
  const host = new URL(normalized).hostname.toLowerCase();
  for (const platform of Object.keys(DOMAINS) as Platform[]) {
    if (DOMAINS[platform].some((d) => host === d || host.endsWith(`.${d}`))) {
      return platform;
    }
  }
  return null;
}

/** Formats a VND amount, e.g. 125000 -> "125.000đ". */
export function formatVnd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value).toLocaleString('vi-VN')}đ`;
}
