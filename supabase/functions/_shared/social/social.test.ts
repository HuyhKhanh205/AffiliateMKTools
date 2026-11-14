// Run: deno test --no-config supabase/functions/_shared/social/social.test.ts
import { cleanTitle } from '../page-meta.ts';
import { signState, verifyState } from './state.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test('signed state round-trips and rejects tampering', async () => {
  const s = await signState('secret-1', { userId: 'u1', provider: 'threads', issuedAt: Date.now() });
  const ok = await verifyState('secret-1', s);
  assert(ok?.userId === 'u1' && ok.provider === 'threads', 'valid state should verify');
  assert((await verifyState('secret-2', s)) === null, 'wrong secret must fail');
  const [body, sig] = s.split('.');
  const forged = btoa(JSON.stringify({ userId: 'attacker', provider: 'threads', issuedAt: Date.now() })).replace(/=+$/, '');
  assert((await verifyState('secret-1', `${forged}.${sig}`)) === null, 'forged body must fail');
  assert((await verifyState('secret-1', `${body}.x${sig.slice(1)}`)) === null, 'forged signature must fail');
});

Deno.test('state expires', async () => {
  const s = await signState('k', { userId: 'u', provider: 'instagram', issuedAt: Date.now() - 16 * 60 * 1000 });
  assert((await verifyState('k', s)) === null, 'expired state must fail');
});

Deno.test('cleanTitle strips marketplace suffixes', () => {
  assert(cleanTitle('Tai nghe Bluetooth XYZ | Shopee Việt Nam') === 'Tai nghe Bluetooth XYZ', 'shopee suffix');
  assert(cleanTitle('Nồi chiên 5L - Tiki') === 'Nồi chiên 5L', 'tiki suffix');
  assert(cleanTitle('Mua Điện thoại Samsung Galaxy A05s | Tiki') === 'Điện thoại Samsung Galaxy A05s', 'tiki "Mua" prefix');
  assert(cleanTitle('Shopee Việt Nam') === null, 'generic title rejected');
  assert(cleanTitle(null) === null, 'null');
});
