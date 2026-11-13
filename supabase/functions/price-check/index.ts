// POST /functions/v1/price-check   (header x-cron-secret: <CRON_SECRET>)
// Run daily by pg_cron. Fetches current prices through the configured
// marketplace APIs and appends them to price_history; the apply_price()
// trigger then updates products.current_price and products.is_deal.
import { adminClient, json } from '../_shared/http.ts';
import { Platform, providerFor } from '../_shared/providers/index.ts';

const BATCH = Number(Deno.env.get('PRICE_CHECK_BATCH') ?? '200');
const admin = adminClient();

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden' }, 403);

  const platforms = (['shopee', 'lazada', 'tiki', 'tiktok'] as Platform[]).filter((p) => providerFor(p)?.providesPrice);
  if (platforms.length === 0) return json({ checked: 0, note: 'Chưa cấu hình API sàn nào có trả giá (hiện chỉ Shopee).' });

  // Oldest-checked first, so a large catalogue is covered over several runs.
  const { data: products, error } = await admin
    .from('products')
    .select('id, user_id, platform, original_url')
    .in('platform', platforms)
    .order('price_updated_at', { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) return json({ error: error.message }, 500);

  let checked = 0;
  const failures: { id: string; error: string }[] = [];
  for (const product of products ?? []) {
    const provider = providerFor(product.platform as Platform)!;
    try {
      const info = await provider.lookup(product.original_url, product.platform as Platform);
      if (info.price === undefined) continue;
      const { error: insertError } = await admin.from('price_history').insert({
        product_id: product.id,
        user_id: product.user_id,
        price: info.price,
        source: provider.name,
      });
      if (insertError) throw insertError;
      checked++;
    } catch (e) {
      failures.push({ id: product.id, error: e instanceof Error ? e.message : String(e) });
    }
    await new Promise((r) => setTimeout(r, 250)); // stay well under API rate limits
  }

  return json({ checked, failed: failures.length, failures: failures.slice(0, 20) });
});
