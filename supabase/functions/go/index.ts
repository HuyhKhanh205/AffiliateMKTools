// Tracked redirect: GET /functions/v1/go/<slug>[?s=<channel>]
// Logs a click, then sends the visitor to the affiliate URL with a 302.
import { adminClient } from '../_shared/http.ts';

declare const EdgeRuntime: { waitUntil(promise: PromiseLike<unknown>): void } | undefined;

const CHANNELS = new Set(['tiktok', 'facebook', 'instagram', 'threads', 'zalo', 'youtube', 'bio', 'other']);
// Link-preview crawlers (Facebook, Zalo, Telegram...) fetch the URL when a link
// is pasted; counting them would inflate clicks.
const BOT_UA = /bot|crawler|spider|preview|facebookexternalhit|zalo.*(crawler|bot)|whatsapp|telegram|slackbot|discord|curl|wget|python-requests/i;

const admin = adminClient();

function notFound(): Response {
  return new Response('Link không tồn tại hoặc đã bị xoá.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });

  const url = new URL(req.url);
  const slug = url.pathname.split('/').filter(Boolean).pop() ?? '';
  if (!/^[a-z0-9]{4,32}$/.test(slug)) return notFound();

  const { data: link, error } = await admin
    .from('links')
    .select('id, user_id, channel, products(affiliate_url)')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error('link lookup failed', error.message);
    return new Response('Lỗi tạm thời, vui lòng thử lại.', { status: 503 });
  }
  const product = link?.products as unknown as { affiliate_url: string } | null;
  if (!link || !product?.affiliate_url) return notFound();

  const userAgent = req.headers.get('user-agent') ?? '';
  if (req.method === 'GET' && !BOT_UA.test(userAgent)) {
    const s = url.searchParams.get('s');
    const insert = admin
      .from('clicks')
      .insert({
        link_id: link.id,
        user_id: link.user_id,
        channel: s && CHANNELS.has(s) ? s : link.channel,
        referrer: req.headers.get('referer')?.slice(0, 500) ?? null,
        user_agent: userAgent.slice(0, 300),
      })
      .then(({ error: e }) => e && console.error('click insert failed', e.message));
    // Redirect immediately; finish logging in the background when supported.
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(insert);
    else await insert;
  }

  return new Response(null, {
    status: 302,
    headers: { Location: product.affiliate_url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' },
  });
});
