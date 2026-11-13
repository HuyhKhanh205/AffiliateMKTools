export type Platform = 'shopee' | 'lazada' | 'tiki' | 'tiktok';

export interface LookupResult {
  affiliate_url?: string;
  title?: string;
  image_url?: string;
  price?: number;
  commission_rate?: number; // percent
}

export interface Provider {
  name: string;
  platforms: Platform[];
  /** Whether lookup() returns a current price (used by price-check). */
  providesPrice: boolean;
  /** True when the secrets this provider needs are set. */
  configured(): boolean;
  /** Product info + affiliate link for a product URL. Throws on API errors. */
  lookup(productUrl: string, platform: Platform): Promise<LookupResult>;
}

/** Follows redirects of short links (s.shopee.vn, shp.ee, c.lazada.vn...) to the final product URL. */
export async function resolveUrl(url: string, maxHops = 5): Promise<string> {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const res = await fetch(current, { method: 'GET', redirect: 'manual' });
    await res.body?.cancel();
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return current;
    current = new URL(location, current).toString();
  }
  return current;
}
