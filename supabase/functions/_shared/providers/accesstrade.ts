// AccessTrade Vietnam publisher API (https://pub.accesstrade.vn → Tài khoản → API Key).
// Creates tracked deep links for Lazada and Tiki. Needs ACCESSTRADE_TOKEN and
// the campaign id of each merchant you joined:
//   ACCESSTRADE_CAMPAIGN_LAZADA, ACCESSTRADE_CAMPAIGN_TIKI
// NOTE: written from AccessTrade's public API docs without a live key; check
// the response shape on your first call. Price tracking is not available via
// this API, so Lazada/Tiki prices are updated manually in the app.
import { LookupResult, Platform, Provider } from './types.ts';

const ENDPOINT = 'https://api.accesstrade.vn/v1/product_link/create';

function campaignId(platform: Platform): string | undefined {
  return Deno.env.get(`ACCESSTRADE_CAMPAIGN_${platform.toUpperCase()}`);
}

export const accesstrade: Provider = {
  name: 'accesstrade',
  platforms: ['lazada', 'tiki'],
  providesPrice: false,
  configured: () => Boolean(Deno.env.get('ACCESSTRADE_TOKEN')),

  async lookup(productUrl: string, platform: Platform): Promise<LookupResult> {
    const campaign = campaignId(platform);
    if (!campaign) throw new Error(`Thiếu ACCESSTRADE_CAMPAIGN_${platform.toUpperCase()}`);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${Deno.env.get('ACCESSTRADE_TOKEN')}`,
      },
      body: JSON.stringify({ campaign_id: campaign, urls: [productUrl], utm_source: 'affiliatehub' }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`AccessTrade API: ${body.message ?? res.status}`);
    const link = body.data?.success_link?.[0];
    return { affiliate_url: link?.short_link || link?.aff_link || undefined };
  },
};
