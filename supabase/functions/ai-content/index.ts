// POST /functions/v1/ai-content  { product_id, channel, tone?, notes? }
// Writes a short Vietnamese post (hook, caption, hashtags, CTA) for one product
// and channel with Claude Haiku 5.5, and records token usage for cost tracking.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { adminClient, corsHeaders, json, requireUser } from '../_shared/http.ts';

const MODEL = 'claude-haiku-5-5';
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '50');
const CHANNELS = new Set(['tiktok', 'facebook', 'instagram', 'threads', 'zalo', 'youtube', 'bio', 'other']);

const PLATFORM_NAMES: Record<string, string> = {
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiki: 'Tiki',
  tiktok: 'TikTok Shop',
};

const CHANNEL_GUIDES: Record<string, string> = {
  tiktok: 'Kịch bản lời thoại/caption cho video TikTok ngắn 15-30 giây: hook mạnh trong 3 giây đầu, câu ngắn, tự nhiên như người thật review. Caption tối đa 150 ký tự. 3-5 hashtag.',
  facebook: 'Bài đăng Facebook: 3-5 đoạn ngắn, kể trải nghiệm/lợi ích cụ thể, có thể dùng emoji vừa phải. 3-5 hashtag.',
  instagram: 'Caption Instagram: 2-4 câu, giàu hình ảnh, emoji vừa phải. 5-8 hashtag.',
  threads: 'Bài Threads tối đa 400 ký tự, giọng trò chuyện, tối đa 1 hashtag.',
  zalo: 'Tin nhắn Zalo gửi nhóm/bạn bè: thân mật, ngắn gọn 2-4 câu, không dùng hashtag (trả về danh sách rỗng).',
  youtube: 'Mô tả video YouTube Shorts: 2-3 câu nêu lợi ích chính. 3-5 hashtag.',
  bio: 'Mô tả ngắn 1-2 câu cho sản phẩm trên trang bio link. Không hashtag (trả về danh sách rỗng).',
  other: 'Nội dung ngắn gọn, dùng được trên nhiều kênh. 3-5 hashtag.',
};

// Kept byte-for-byte stable so it can be prompt-cached if it ever grows past the cache minimum.
const SYSTEM = `Bạn là copywriter affiliate người Việt, viết nội dung bán hàng trung thực cho mạng xã hội.

Quy tắc:
- Viết tiếng Việt tự nhiên, đúng chính tả, giọng như người dùng thật chia sẻ.
- Chỉ dùng thông tin được cung cấp. Không bịa thông số, đánh giá sao, số lượng đã bán, giá hoặc khuyến mãi không có trong dữ liệu.
- Không cam kết tuyệt đối ("tốt nhất", "100%"), không nói sai về công dụng sức khoẻ.
- Luôn có một câu ngắn minh bạch rằng đây là link affiliate (ví dụ: "Link mình để ở bio, mình nhận hoa hồng nhỏ nếu bạn mua qua link").
- "cta" là lời kêu gọi hành động ngắn, hướng người xem bấm link ở bio/bình luận.
- Hashtag không có dấu, không khoảng trắng, bắt đầu bằng #.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    hook: { type: 'string', description: 'Câu mở đầu thu hút' },
    caption: { type: 'string', description: 'Nội dung chính' },
    hashtags: { type: 'array', items: { type: 'string' } },
    cta: { type: 'string', description: 'Lời kêu gọi hành động' },
  },
  required: ['hook', 'caption', 'hashtags', 'cta'],
  additionalProperties: false,
};

// Created on first use: the SDK throws at construction when the key is missing,
// which would crash the function at boot instead of returning a clear error.
let anthropic: Anthropic | null = null;
const admin = adminClient();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await requireUser(req, admin);
  if (!user) return json({ error: 'Bạn cần đăng nhập.' }, 401);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: 'Chưa cấu hình ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets).' }, 503);
  }
  anthropic ??= new Anthropic({ apiKey });

  let body: { product_id?: string; channel?: string; tone?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body phải là JSON.' }, 400);
  }
  const channel = body.channel && CHANNELS.has(body.channel) ? body.channel : 'tiktok';
  if (!body.product_id) return json({ error: 'Thiếu product_id.' }, 400);

  // Daily quota keeps the bill predictable.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from('ai_generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since);
  if (countError) return json({ error: countError.message }, 500);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return json({ error: `Đã dùng hết ${DAILY_LIMIT} lượt AI trong 24 giờ qua.` }, 429);
  }

  const { data: product, error: productError } = await admin
    .from('products')
    .select('id, title, platform, current_price, commission_rate')
    .eq('id', body.product_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (productError) return json({ error: productError.message }, 500);
  if (!product) return json({ error: 'Không tìm thấy sản phẩm.' }, 404);

  const facts = [
    `Sản phẩm: ${product.title}`,
    `Sàn: ${PLATFORM_NAMES[product.platform] ?? product.platform}`,
    product.current_price ? `Giá hiện tại: ${Math.round(product.current_price).toLocaleString('vi-VN')}đ` : null,
    body.notes ? `Ghi chú của người bán (điểm nổi bật, trải nghiệm thật): ${body.notes.slice(0, 1000)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: `${facts}\n\nKênh: ${channel}. ${CHANNEL_GUIDES[channel]}\nGiọng văn: ${body.tone?.slice(0, 100) || 'thân thiện, chân thật'}.`,
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'AI đang quá tải, thử lại sau ít phút.' }, 429);
    if (error instanceof Anthropic.AuthenticationError) return json({ error: 'ANTHROPIC_API_KEY chưa đúng.' }, 500);
    if (error instanceof Anthropic.APIError) return json({ error: `Lỗi AI (${error.status}).` }, 502);
    throw error;
  }

  if (message.stop_reason === 'refusal') {
    return json({ error: 'AI từ chối viết nội dung cho sản phẩm này.' }, 422);
  }
  const text = message.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text' || message.stop_reason === 'max_tokens') {
    return json({ error: 'AI không trả về nội dung, thử lại.' }, 502);
  }

  let output: { hook: string; caption: string; hashtags: string[]; cta: string };
  try {
    output = JSON.parse(text.text);
  } catch {
    return json({ error: 'AI trả về dữ liệu không hợp lệ, thử lại.' }, 502);
  }

  const usage = { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens };
  const { error: insertError } = await admin.from('ai_generations').insert({
    user_id: user.id,
    product_id: product.id,
    channel,
    output,
    model: MODEL,
    ...usage,
  });
  if (insertError) console.error('ai_generations insert failed', insertError.message);

  return json({ content: output, usage, remaining: Math.max(0, DAILY_LIMIT - (count ?? 0) - 1) });
});
