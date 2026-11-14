// Free, no-AI post templates so a beginner can post without any API key.
// Pure TypeScript: used by the compose-post function and unit-tested from the app.

export type Provider = 'threads' | 'instagram' | 'tiktok';

export interface PostFacts {
  productId: string;
  title: string;
  platform: 'shopee' | 'lazada' | 'tiki' | 'tiktok';
  price?: number | null;
  link: string; // tracked link (clickable on Threads)
  bioUrl?: string | null; // public bio page (Instagram/TikTok: "link in bio")
}

const PLATFORM_NAMES = { shopee: 'Shopee', lazada: 'Lazada', tiki: 'Tiki', tiktok: 'TikTok Shop' } as const;
const DISCLOSURE = '(Link affiliate: mình nhận hoa hồng nhỏ, giá bạn trả không đổi.)';

/** Threads counts emoji (astral code points) as 4; same rule as threadsLength() in ../slug-title.ts. */
function threadsLen(text: string): number {
  let n = 0;
  for (const ch of text) n += (ch.codePointAt(0) ?? 0) > 0xffff ? 4 : 1;
  return n;
}

function formatPrice(price?: number | null): string | null {
  if (!price || !Number.isFinite(price)) return null;
  return `${Math.round(price).toLocaleString('vi-VN')}đ`;
}

/** Stable pseudo-random pick so the same product keeps the same variant, different products vary. */
function pick<T>(items: T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return items[h % items.length];
}

const HOOKS = [
  (t: string) => `🔥 Món này đang được săn nhiều: ${t}`,
  (t: string) => `👀 Tìm được món hời: ${t}`,
  (t: string) => `✨ Mình vừa thấy ${t} và thấy đáng để chia sẻ`,
  (t: string) => `💸 Đồ ngon giá tốt: ${t}`,
];

const BODIES = [
  'Ai đang cần thì tham khảo nhé, nhớ xem kỹ đánh giá và phân loại trước khi đặt.',
  'Mình để link bên dưới cho bạn nào cần, xem kỹ mô tả và voucher trước khi mua nha.',
  'Lưu lại để lúc cần mua cho tiện, sàn hay có mã giảm giá thêm đó.',
];

function shortTitle(title: string, max = 120): string {
  const t = title.trim();
  return [...t].length > max ? `${[...t].slice(0, max - 3).join('').trimEnd()}...` : t;
}

const IG_BODIES = [
  'Ai đang cần thì tham khảo nhé, nhớ xem kỹ đánh giá và phân loại trước khi đặt.',
  'Lưu bài lại để lúc cần mua cho tiện, sàn hay có mã giảm giá thêm đó.',
  'Mình thấy đáng tiền nên chia sẻ, bạn xem kỹ mô tả và voucher trước khi mua nha.',
];

export function threadsTemplate(f: PostFacts): string {
  const price = formatPrice(f.price);
  const parts = [
    pick(HOOKS, f.productId)(shortTitle(f.title)),
    price ? `Giá hiện tại trên ${PLATFORM_NAMES[f.platform]}: ${price}` : `Có trên ${PLATFORM_NAMES[f.platform]}.`,
    pick(BODIES, `${f.productId}b`),
    `👉 Xem / mua: ${f.link}`,
    DISCLOSURE,
  ];
  let text = parts.join('\n\n');
  if (threadsLen(text) > 490) text = [parts[0], `👉 ${f.link}`, DISCLOSURE].join('\n\n');
  return text;
}

export function instagramTemplate(f: PostFacts): string {
  const price = formatPrice(f.price);
  const tags = ['#review', '#deal', '#muasamonline', '#gocchiase', `#${PLATFORM_NAMES[f.platform].replace(/\s/g, '').toLowerCase()}`];
  return [
    pick(HOOKS, f.productId)(shortTitle(f.title, 150)),
    price ? `💰 Giá tham khảo: ${price} (${PLATFORM_NAMES[f.platform]})` : `🛒 Có trên ${PLATFORM_NAMES[f.platform]}`,
    pick(IG_BODIES, `${f.productId}b`),
    '👉 Link mua ở bio (mục sản phẩm mới nhất).',
    DISCLOSURE,
    tags.join(' '),
  ].join('\n\n');
}

export function tiktokTemplate(f: PostFacts): string {
  const price = formatPrice(f.price);
  return [
    `${pick(HOOKS, f.productId)(shortTitle(f.title, 80))}${price ? ` chỉ ${price}` : ''}`,
    '👉 Link ở bio nha!',
    DISCLOSURE,
    '#review #deal #xuhuong #fyp',
  ].join('\n');
}

export function templateFor(provider: Provider, facts: PostFacts): string {
  if (provider === 'threads') return threadsTemplate(facts);
  if (provider === 'instagram') return instagramTemplate(facts);
  return tiktokTemplate(facts);
}
