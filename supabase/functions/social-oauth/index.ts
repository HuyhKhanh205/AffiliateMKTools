// Connect / disconnect Threads and Instagram accounts.
//   POST { action: 'start', provider }      -> { url } to open Meta's login page   (needs user JWT)
//   POST { action: 'disconnect', provider } -> removes the account and its token  (needs user JWT)
//   POST { action: 'status' }                -> which providers are configured on the server
//   GET  /social-oauth/callback?code&state   -> Meta redirects here; saves the token, then redirects to the app
// verify_jwt is off (Meta's redirect carries no JWT); start/disconnect check the user in code.
import { adminClient, corsHeaders, json, requireUser } from '../_shared/http.ts';
import { authorizeUrl, exchangeCode, fetchProfile, isConfigured, MetaProvider } from '../_shared/social/meta.ts';
import { signState, verifyState } from '../_shared/social/state.ts';

const admin = adminClient();
const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/social-oauth/callback`;
const SITE_URL = (Deno.env.get('APP_SITE_URL') ?? '').replace(/\/+$/, '');
const PROVIDERS = new Set<MetaProvider>(['threads', 'instagram']);

function stateSecret(): string {
  const s = Deno.env.get('SOCIAL_STATE_SECRET');
  if (!s) throw new Error('Thiếu SOCIAL_STATE_SECRET.');
  return s;
}

function backToApp(query: Record<string, string>): Response {
  const target = new URL(`${SITE_URL || 'https://localhost'}/settings`);
  for (const [k, v] of Object.entries(query)) target.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

async function callback(url: URL): Promise<Response> {
  if (url.searchParams.get('error')) {
    return backToApp({ social_error: 'Bạn đã huỷ kết nối.' });
  }
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return backToApp({ social_error: 'Thiếu mã đăng nhập, thử kết nối lại.' });

  const payload = await verifyState(stateSecret(), state);
  if (!payload || !PROVIDERS.has(payload.provider as MetaProvider)) {
    return backToApp({ social_error: 'Phiên kết nối hết hạn, bấm Kết nối lại.' });
  }
  const provider = payload.provider as MetaProvider;

  try {
    const token = await exchangeCode(provider, code, REDIRECT_URI);
    const profile = await fetchProfile(provider, token.accessToken);
    const account = {
      user_id: payload.userId,
      provider,
      account_id: profile.accountId,
      username: profile.username,
      expires_at: token.expiresAt.toISOString(),
      connected_at: new Date().toISOString(),
    };
    const { error: e1 } = await admin.from('social_accounts').upsert(account, { onConflict: 'user_id,provider' });
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await admin.from('social_tokens').upsert(
      {
        user_id: payload.userId,
        provider,
        access_token: token.accessToken,
        expires_at: token.expiresAt.toISOString(),
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    );
    if (e2) throw new Error(e2.message);
    return backToApp({ connected: provider });
  } catch (e) {
    console.error('oauth callback failed', provider, e instanceof Error ? e.message : e);
    return backToApp({ social_error: e instanceof Error ? e.message.slice(0, 200) : 'Kết nối thất bại.' });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  if (req.method === 'GET' && url.pathname.endsWith('/callback')) return callback(url);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await requireUser(req, admin);
  if (!user) return json({ error: 'Bạn cần đăng nhập.' }, 401);

  let body: { action?: string; provider?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body phải là JSON.' }, 400);
  }

  if (body.action === 'status') {
    return json({ configured: { threads: isConfigured('threads'), instagram: isConfigured('instagram') } });
  }

  const provider = body.provider as MetaProvider;
  if (!PROVIDERS.has(provider)) return json({ error: 'Kênh không hợp lệ.' }, 400);

  if (body.action === 'start') {
    if (!isConfigured(provider)) {
      const prefix = provider === 'threads' ? 'THREADS' : 'INSTAGRAM';
      return json({ error: `Chưa cấu hình app ${provider === 'threads' ? 'Threads' : 'Instagram'}: thêm ${prefix}_APP_ID và ${prefix}_APP_SECRET vào Supabase Secrets (xem README).` }, 503);
    }
    const state = await signState(stateSecret(), { userId: user.id, provider, issuedAt: Date.now() });
    return json({ url: authorizeUrl(provider, REDIRECT_URI, state) });
  }

  if (body.action === 'disconnect') {
    const { error } = await admin.from('social_accounts').delete().eq('user_id', user.id).eq('provider', provider);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: 'action phải là start, disconnect hoặc status.' }, 400);
});
