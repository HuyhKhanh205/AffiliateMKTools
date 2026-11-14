// POST /functions/v1/compose-post  { product_id, notes? }
// Drafts one post per network (Threads, Instagram, TikTok caption) for a product.
// With ANTHROPIC_API_KEY it uses Claude Haiku 5.5; without it, free built-in templates.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { adminClient, corsHeaders, json, requireUser } from '../_shared/http.ts';
import { bioUrlFor, ensureLinkSlug, trackedUrl } from '../_shared/links.ts';
import { threadsLength } from '../_shared/slug-title.ts';
import { PostFacts, Provider, templateFor } from '../_shared/social/templates.ts';

const MODEL = 'claude-haiku-5-5';
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '50');
const PROVIDERS: Provider[] = ['threads', 'instagram', 'tiktok'];

const SYSTEM = `Bạn là copywriter affiliate người Việt, viết bài đăng mạng xã hội trung thực cho người mới làm affiliate.

Quy tắc chung:
- Tiếng Việt tự nhiên, đúng chính tả, giọng người thật chia sẻ; emoji vừa phải.
- Chỉ dùng thông tin được cung cấp. Không bịa thông số, số sao, lượt bán, giá hay khuyến mãi.
- Không cam kết tuyệt đối ("tốt nhất", "100%"), không nói sai công dụng sức khoẻ.
- Mỗi bài có một câu ngắn minh bạch đây là link affiliate.

Từng kênh:
- threads: tối đa 400 ký tự, PHẢI chứa nguyên văn đường link được cung cấp, tối đa 1 hashtag.
- instagram: 3-6 câu ngắn, KHÔNG chứa đường link (Instagram không bấm được link), ghi "link ở bio"; cuối bài 5-8 hashtag không dấu.
- tiktok: caption tối đa 150 ký tự, ghi "link ở bio", 3-5 hashtag.`;

const SCHEMA = {
  type: 'object',
  properties: {
    threads: { type: 'string' },
    instagram: { type: 'string' },
    tiktok: { type: 'string' },
  },
  required: ['threads', 'instagram', 'tiktok'],
  additionalProperties: false,
};

const admin = adminClient();
let anthropic: Anthropic | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await requireUser(req, admin);
  if (!user) return json({ error: 'Bạn cần đăng nhập.' }, 401);

  let body: { product_id?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body phải là JSON.' }, 400);
  }
  if (!body.product_id) return json({ error: 'Thiếu product_id.' }, 400);

  const { data: product, error } = await admin
    .from('products')
    .select('id, title, platform, current_price')
    .eq('id', body.product_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!product) return json({ error: 'Không tìm thấy sản phẩm.' }, 404);

  const [threadsSlug, bioUrl, accounts] = await Promise.all([
    ensureLinkSlug(admin, user.id, product.id, 'threads'),
    bioUrlFor(admin, user.id),
    admin.from('social_accounts').select('provider, username').eq('user_id', user.id),
  ]);
  const facts: PostFacts = {
    productId: product.id,
    title: product.title,
    platform: product.platform,
    price: product.current_price,
    link: trackedUrl(threadsSlug),
    bioUrl,
  };

  const templates = Object.fromEntries(PROVIDERS.map((p) => [p, templateFor(p, facts)])) as Record<Provider, string>;
  let drafts = templates;
  let source: 'ai' | 'template' = 'template';
  let aiNote: string | null = null;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (apiKey) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('ai_generations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      aiNote = `Hết ${DAILY_LIMIT} lượt AI hôm nay, đang dùng mẫu có sẵn.`;
    } else {
      try {
        anthropic ??= new Anthropic({ apiKey });
        const facts_text = [
          `Sản phẩm: ${product.title}`,
          `Sàn: ${product.platform}`,
          product.current_price ? `Giá: ${Math.round(product.current_price).toLocaleString('vi-VN')}đ` : null,
          `Link (chỉ dùng cho threads): ${facts.link}`,
          body.notes ? `Ghi chú của người bán: ${body.notes.slice(0, 800)}` : null,
        ]
          .filter(Boolean)
          .join('\n');
        const message = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: SYSTEM,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
          messages: [{ role: 'user', content: facts_text }],
        });
        const text = message.content.find((b) => b.type === 'text');
        if (message.stop_reason === 'end_turn' && text && text.type === 'text') {
          const out = JSON.parse(text.text) as Record<Provider, string>;
          // Keep the AI draft only where it respects each network's rules.
          drafts = {
            threads: out.threads.includes(facts.link) && threadsLength(out.threads) <= 500 ? out.threads : templates.threads,
            instagram: out.instagram && out.instagram.length <= 2200 ? out.instagram : templates.instagram,
            tiktok: out.tiktok && out.tiktok.length <= 2200 ? out.tiktok : templates.tiktok,
          };
          source = 'ai';
          await admin.from('ai_generations').insert({
            user_id: user.id,
            product_id: product.id,
            channel: 'threads',
            output: out,
            model: MODEL,
            input_tokens: message.usage.input_tokens,
            output_tokens: message.usage.output_tokens,
          });
        } else {
          aiNote = 'AI không trả lời được, đang dùng mẫu có sẵn.';
        }
      } catch (e) {
        console.error('compose-post AI failed', e instanceof Error ? e.message : e);
        aiNote = 'AI tạm lỗi, đang dùng mẫu có sẵn.';
      }
    }
  }

  const connected = Object.fromEntries((accounts.data ?? []).map((a) => [a.provider, a.username ?? true]));
  return json({ drafts, source, aiNote, link: facts.link, bioUrl, connected });
});
