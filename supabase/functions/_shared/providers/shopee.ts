// Shopee Affiliate Open API (https://affiliate.shopee.vn → Open API).
// Needs SHOPEE_APP_ID and SHOPEE_APP_SECRET, issued after Shopee approves your
// affiliate account for API access.
//
// Auth header, per Shopee's Open API docs:
//   Authorization: SHA256 Credential=<AppId>, Timestamp=<unix>, Signature=<sha256(AppId+Timestamp+Payload+Secret)>
// NOTE: written from the public docs without a live key; if Shopee changes a
// field name, adjust the GraphQL queries below.
import { LookupResult, Provider, resolveUrl } from './types.ts';

const ENDPOINT = 'https://open-api.affiliate.shopee.vn/graphql';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function call<T>(query: string): Promise<T> {
  const appId = Deno.env.get('SHOPEE_APP_ID')!;
  const secret = Deno.env.get('SHOPEE_APP_SECRET')!;
  const payload = JSON.stringify({ query });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await sha256Hex(appId + timestamp + payload + secret);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body: payload,
  });
  const body = await res.json();
  if (!res.ok || body.errors?.length) {
    throw new Error(`Shopee API: ${body.errors?.[0]?.message ?? res.status}`);
  }
  return body.data as T;
}

/** Extracts shop and item ids from shopee.vn product URLs. */
export function parseShopeeIds(url: string): { shopId: string; itemId: string } | null {
  const m = url.match(/-i\.(\d+)\.(\d+)/) ?? url.match(/\/product\/(\d+)\/(\d+)/);
  return m ? { shopId: m[1], itemId: m[2] } : null;
}

export const shopee: Provider = {
  name: 'shopee_api',
  platforms: ['shopee'],
  providesPrice: true,
  configured: () => Boolean(Deno.env.get('SHOPEE_APP_ID') && Deno.env.get('SHOPEE_APP_SECRET')),

  async lookup(productUrl: string): Promise<LookupResult> {
    const fullUrl = /shopee\.vn\/.+(-i\.|\/product\/)/.test(productUrl) ? productUrl : await resolveUrl(productUrl);
    const result: LookupResult = {};

    const ids = parseShopeeIds(fullUrl);
    if (ids) {
      const data = await call<{
        productOfferV2: {
          nodes: { productName: string; imageUrl: string; priceMin: string; commissionRate: string; offerLink: string }[];
        };
      }>(
        `query { productOfferV2(shopId: ${ids.shopId}, itemId: ${ids.itemId}, limit: 1) { nodes { productName imageUrl priceMin commissionRate offerLink } } }`,
      );
      const node = data.productOfferV2.nodes[0];
      if (node) {
        result.title = node.productName;
        result.image_url = node.imageUrl;
        result.price = Number(node.priceMin) || undefined;
        // commissionRate comes back as a fraction, e.g. "0.05" = 5%
        const rate = Number(node.commissionRate);
        result.commission_rate = Number.isFinite(rate) ? +(rate <= 1 ? rate * 100 : rate).toFixed(2) : undefined;
        result.affiliate_url = node.offerLink || undefined;
      }
    }

    if (!result.affiliate_url) {
      const data = await call<{ generateShortLink: { shortLink: string } }>(
        `mutation { generateShortLink(input: { originUrl: ${JSON.stringify(fullUrl)}, subIds: ["affiliatehub"] }) { shortLink } }`,
      );
      result.affiliate_url = data.generateShortLink.shortLink;
    }
    return result;
  },
};
