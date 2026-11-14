// Best-effort product preview from a public product page: the same Open Graph
// tags a chat app reads to show a link preview. One request per lookup; many
// marketplace pages render client-side, so this may return nothing.
import { titleFromUrl } from './slug-title.ts';

export interface PageMeta {
  resolvedUrl: string;
  title: string | null;
  imageUrl: string | null;
}

const UA = 'Mozilla/5.0 (compatible; AffiliateHubPreview/1.0)';

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() : null;
}

/** Strips marketplace suffixes like " | Shopee Việt Nam" or " - Tiki". */
export function cleanTitle(title: string | null): string | null {
  if (!title) return null;
  const t = title
    .replace(/\s*[|\-–]\s*(Shopee( Việt Nam)?|Lazada(\.vn)?( Vietnam)?|Tiki(\.vn)?|TikTok( Shop)?)\s*$/i, '')
    .replace(/^(Mua|Mua ngay)\s+/i, '') // Tiki titles start with "Mua ..."
    .trim();
  if (t.length < 4 || /^(shopee|lazada|tiki|tiktok)/i.test(t)) return null;
  return t.length > 150 ? `${t.slice(0, 147)}...` : t;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(timer);
  }
}

export async function pageMeta(url: string): Promise<PageMeta> {
  let resolvedUrl = url;
  // Follow short-link redirects (s.shopee.vn, vt.tiktok.com, c.lazada.vn...).
  try {
    for (let i = 0; i < 5; i++) {
      const res = await fetchWithTimeout(resolvedUrl, { redirect: 'manual' }, 4000);
      await res.body?.cancel();
      const loc = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !loc) break;
      resolvedUrl = new URL(loc, resolvedUrl).toString();
    }
  } catch {
    // keep what we have
  }

  let title: string | null = null;
  let imageUrl: string | null = null;
  try {
    const res = await fetchWithTimeout(resolvedUrl, { headers: { Accept: 'text/html' } }, 5000);
    if (res.ok && (res.headers.get('content-type') ?? '').includes('html')) {
      const reader = res.body!.getReader();
      let html = '';
      const decoder = new TextDecoder();
      while (html.length < 400_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        if (html.includes('</head>')) break;
      }
      await reader.cancel();
      title = cleanTitle(metaContent(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null);
      const img = metaContent(html, 'og:image');
      imageUrl = img && /^https:\/\//i.test(img) ? img : null;
    } else {
      await res.body?.cancel();
    }
  } catch {
    // page blocked or slow: fall back to the URL slug
  }

  return { resolvedUrl, title: title ?? titleFromUrl(resolvedUrl) ?? titleFromUrl(url), imageUrl };
}
