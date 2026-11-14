import { threadsLength, titleFromUrl } from '../../../supabase/functions/_shared/slug-title';
import { instagramTemplate, templateFor, threadsTemplate, tiktokTemplate } from '../../../supabase/functions/_shared/social/templates';

describe('titleFromUrl', () => {
  it.each([
    ['https://shopee.vn/Tai-nghe-Bluetooth-chống-ồn-i.123456.789012', 'Tai nghe Bluetooth chống ồn'],
    ['https://shopee.vn/Tai-nghe-Bluetooth-ch%E1%BB%91ng-%E1%BB%93n-i.1.2?sp_atk=x', 'Tai nghe Bluetooth chống ồn'],
    ['https://www.lazada.vn/products/noi-chien-khong-dau-5l-i123456-s789.html', 'Noi chien khong dau 5l'],
    ['https://tiki.vn/sach-dac-nhan-tam-p273258825.html?spid=1', 'Sach dac nhan tam'],
    ['https://s.shopee.vn/AbCdEf', null],
    ['https://shop.tiktok.com/view/product/1729384756', null],
    ['https://vt.tiktok.com/ZSabc123/', null],
    ['not a url', null],
  ])('%s -> %s', (url, expected) => {
    expect(titleFromUrl(url)).toBe(expected);
  });

  it('truncates very long slugs', () => {
    const t = titleFromUrl(`https://shopee.vn/${'Ao-thun-'.repeat(30)}x-i.1.2`)!;
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t.endsWith('...')).toBe(true);
  });
});

describe('threadsLength', () => {
  it('counts emoji as 4 and Vietnamese letters as 1', () => {
    expect(threadsLength('Chống ồn')).toBe(8);
    expect(threadsLength('🔥a')).toBe(5);
  });
});

describe('post templates', () => {
  const facts = {
    productId: 'p-1',
    title: 'Tai nghe Bluetooth chống ồn',
    platform: 'shopee' as const,
    price: 349000,
    link: 'https://x.supabase.co/functions/v1/go/abc1234',
    bioUrl: 'https://example.github.io/AffiliateMKTools/u/khanh',
  };

  it('Threads post has the clickable link, price, disclosure and fits 500', () => {
    const t = threadsTemplate(facts);
    expect(t).toContain(facts.link);
    expect(t).toMatch(/349.000đ/);
    expect(t).toContain('Link affiliate');
    expect(threadsLength(t)).toBeLessThanOrEqual(500);
  });

  it('shortens the Threads post when the title is very long', () => {
    const t = threadsTemplate({ ...facts, title: 'Rất dài '.repeat(60) });
    expect(t).toContain(facts.link);
    expect(threadsLength(t)).toBeLessThanOrEqual(500);
  });

  it('Instagram caption points to the bio instead of a link and has hashtags', () => {
    const t = instagramTemplate(facts);
    expect(t).not.toContain('http');
    expect(t).toMatch(/bio/);
    expect(t).not.toMatch(/bên dưới/);
    expect(t).toMatch(/#shopee/);
  });

  it('TikTok caption is short and points to the bio', () => {
    const t = tiktokTemplate({ ...facts, price: null });
    expect(t).toMatch(/bio/);
    expect(t).not.toContain('http');
  });

  it('is stable per product and varies across products', () => {
    expect(templateFor('threads', facts)).toBe(templateFor('threads', facts));
    const variants = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => threadsTemplate({ ...facts, productId: id }).split('\n')[0]));
    expect(variants.size).toBeGreaterThan(1);
  });
});
