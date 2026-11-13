// Run: deno test supabase/functions/_shared/providers/shopee.test.ts
import { parseShopeeIds } from './shopee.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('parses shop and item id from a product slug URL', () => {
  assertEquals(parseShopeeIds('https://shopee.vn/Tai-nghe-Bluetooth-i.123456.987654321?sp_atk=x'), {
    shopId: '123456',
    itemId: '987654321',
  });
});

Deno.test('parses the /product/<shop>/<item> form', () => {
  assertEquals(parseShopeeIds('https://shopee.vn/product/111/222'), { shopId: '111', itemId: '222' });
});

Deno.test('returns null for short links (they are resolved first)', () => {
  assertEquals(parseShopeeIds('https://s.shopee.vn/AbCdE'), null);
});
