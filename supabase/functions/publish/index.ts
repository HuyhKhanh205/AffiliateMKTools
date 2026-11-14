// POST /functions/v1/publish  { provider: 'threads' | 'instagram', text, image_url?, product_id? }
// Publishes a post on the user's connected account and records it in `posts`.
import { adminClient, corsHeaders, json, requireUser } from '../_shared/http.ts';
import { ensureLinkSlug, trackedUrl } from '../_shared/links.ts';
import { threadsLength } from '../_shared/slug-title.ts';
import { MetaApiError, publishInstagram, publishThreads } from '../_shared/social/meta.ts';

const DAILY_POST_LIMIT = Number(Deno.env.get('DAILY_POST_LIMIT') ?? '25'); // per network, well under Meta's limits
const NAMES: Record<string, string> = { threads: 'Threads', instagram: 'Instagram' };
const admin = adminClient();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await requireUser(req, admin);
  if (!user) return json({ error: 'Bạn cần đăng nhập.' }, 401);

  let body: { provider?: string; text?: string; image_url?: string | null; product_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body phải là JSON.' }, 400);
  }
  const provider = body.provider;
  if (provider === 'tiktok') return json({ error: 'Đăng TikTok tự động sẽ có ở bước sau. Hiện hãy copy caption để tự đăng.' }, 400);
  if (provider !== 'threads' && provider !== 'instagram') return json({ error: 'Kênh không hợp lệ.' }, 400);

  const text = (body.text ?? '').trim();
  const imageUrl = body.image_url && /^https:\/\//i.test(body.image_url) ? body.image_url : null;
  if (!text) return json({ error: 'Nội dung bài trống.' }, 400);
  if (provider === 'threads' && threadsLength(text) > 500) return json({ error: 'Bài Threads tối đa 500 ký tự (emoji tính 4).' }, 400);
  if (provider === 'instagram' && !imageUrl) return json({ error: 'Instagram bắt buộc có ảnh. Chọn ảnh sản phẩm rồi thử lại.' }, 400);
  if (provider === 'instagram' && text.length > 2200) return json({ error: 'Caption Instagram tối đa 2.200 ký tự.' }, 400);

  const [{ data: account }, { data: token }] = await Promise.all([
    admin.from('social_accounts').select('account_id, username').eq('user_id', user.id).eq('provider', provider).maybeSingle(),
    admin.from('social_tokens').select('access_token, expires_at').eq('user_id', user.id).eq('provider', provider).maybeSingle(),
  ]);
  if (!account || !token) return json({ error: `Chưa kết nối ${NAMES[provider]}. Vào Cài đặt → Kết nối kênh.` }, 409);
  if (token.expires_at && new Date(token.expires_at) < new Date()) {
    return json({ error: `Kết nối ${NAMES[provider]} đã hết hạn. Vào Cài đặt bấm Kết nối lại.` }, 409);
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('provider', provider)
    .neq('status', 'failed')
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_POST_LIMIT) {
    return json({ error: `Đã đăng ${DAILY_POST_LIMIT} bài ${NAMES[provider]} trong 24 giờ. Đăng dồn dập dễ bị coi là spam.` }, 429);
  }

  let productId: string | null = null;
  if (body.product_id) {
    const { data: product } = await admin.from('products').select('id').eq('id', body.product_id).eq('user_id', user.id).maybeSingle();
    productId = product?.id ?? null;
  }

  const { data: row, error: insertError } = await admin
    .from('posts')
    .insert({ user_id: user.id, product_id: productId, provider, text, image_url: imageUrl, status: 'publishing' })
    .select('id')
    .single();
  if (insertError) return json({ error: insertError.message }, 500);

  try {
    const result =
      provider === 'threads'
        ? await publishThreads(account.account_id, token.access_token, text, {
            imageUrl,
            link: productId ? trackedUrl(await ensureLinkSlug(admin, user.id, productId, 'threads')) : null,
          })
        : await publishInstagram(account.account_id, token.access_token, text, imageUrl!);
    await admin
      .from('posts')
      .update({ status: 'published', external_id: result.externalId, permalink: result.permalink, published_at: new Date().toISOString() })
      .eq('id', row.id);
    return json({ status: 'published', permalink: result.permalink, post_id: row.id });
  } catch (e) {
    const message = e instanceof MetaApiError ? e.message : 'Lỗi không xác định khi đăng bài.';
    if (!(e instanceof MetaApiError)) console.error('publish failed', e);
    await admin.from('posts').update({ status: 'failed', error: message }).eq('id', row.id);
    return json({ error: `${NAMES[provider]}: ${message}`, post_id: row.id }, 502);
  }
});
