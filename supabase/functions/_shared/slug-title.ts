// Pure helpers (no Deno/RN APIs): shared by Edge Functions and the app (src/lib imports this file).

/**
 * Guesses a product name from a marketplace URL slug, e.g.
 *   https://shopee.vn/Tai-nghe-Bluetooth-chống-ồn-i.123.456  -> "Tai nghe Bluetooth chống ồn"
 *   https://www.lazada.vn/products/noi-chien-khong-dau-5l-i123-s456.html -> "Noi chien khong dau 5l"
 *   https://tiki.vn/sach-dac-nhan-tam-p789.html -> "Sach dac nhan tam"
 * Returns null when the URL carries no readable name (short links, TikTok product ids).
 */
export function titleFromUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  let slug = segments[segments.length - 1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // keep raw slug
  }

  slug = slug
    .replace(/-i\.\d+\.\d+$/i, '') // shopee:  ...-i.<shop>.<item>
    .replace(/-i\d+(-s\d+)?(\.html)?$/i, '') // lazada: ...-i<item>-s<sku>.html
    .replace(/-p\d+(\.html)?$/i, '') // tiki:    ...-p<id>.html
    .replace(/\.html?$/i, '');

  const words = slug.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Reject ids and too-short leftovers ("product", "123456", "AbCdE").
  if (words.length < 4 || !/\s/.test(words) || /^\d+$/.test(words.replace(/\s/g, ''))) return null;
  const title = words.charAt(0).toUpperCase() + words.slice(1);
  return title.length > 120 ? `${title.slice(0, 117).trimEnd()}...` : title;
}

/** Threads counts emoji (astral code points) by UTF-8 bytes; other characters as 1. */
export function threadsLength(text: string): number {
  let n = 0;
  for (const ch of text) n += (ch.codePointAt(0) ?? 0) > 0xffff ? 4 : 1;
  return n;
}
