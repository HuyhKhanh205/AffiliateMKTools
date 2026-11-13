// POST /functions/v1/product-lookup  { url, platform }
// Turns a pasted product URL into an affiliate link (plus title, image, price
// when the marketplace API returns them). Without API keys it answers
// { configured: false } and the app falls back to manual entry.
import { adminClient, corsHeaders, json, requireUser } from '../_shared/http.ts';
import { Platform, providerFor } from '../_shared/providers/index.ts';

const PLATFORMS = new Set(['shopee', 'lazada', 'tiki', 'tiktok']);
const admin = adminClient();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!(await requireUser(req, admin))) return json({ error: 'Bạn cần đăng nhập.' }, 401);

  let body: { url?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body phải là JSON.' }, 400);
  }
  if (!body.url || !/^https?:\/\//i.test(body.url) || !body.platform || !PLATFORMS.has(body.platform)) {
    return json({ error: 'Thiếu url hoặc platform.' }, 400);
  }

  const provider = providerFor(body.platform as Platform);
  if (!provider) return json({ configured: false });

  try {
    const result = await provider.lookup(body.url, body.platform as Platform);
    return json({ configured: true, ...result });
  } catch (e) {
    return json({ configured: true, error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
