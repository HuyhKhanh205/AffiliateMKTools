// POST /functions/v1/refresh-social-tokens  (header x-cron-secret: <CRON_SECRET>)
// Weekly: refreshes long-lived Threads/Instagram tokens that expire within 20 days
// (Meta allows refreshing tokens that are at least 24 hours old and still valid).
import { adminClient, json } from '../_shared/http.ts';
import { MetaProvider, refreshToken } from '../_shared/social/meta.ts';

const admin = adminClient();

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden' }, 403);

  const soon = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: tokens, error } = await admin
    .from('social_tokens')
    .select('user_id, provider, access_token, expires_at')
    .in('provider', ['threads', 'instagram'])
    .lt('expires_at', soon)
    .gt('expires_at', new Date().toISOString())
    .lt('refreshed_at', dayAgo);
  if (error) return json({ error: error.message }, 500);

  let refreshed = 0;
  const failures: string[] = [];
  for (const t of tokens ?? []) {
    try {
      const next = await refreshToken(t.provider as MetaProvider, t.access_token);
      const expires_at = next.expiresAt.toISOString();
      await admin
        .from('social_tokens')
        .update({ access_token: next.accessToken, expires_at, refreshed_at: new Date().toISOString() })
        .eq('user_id', t.user_id)
        .eq('provider', t.provider);
      await admin.from('social_accounts').update({ expires_at }).eq('user_id', t.user_id).eq('provider', t.provider);
      refreshed++;
    } catch (e) {
      failures.push(`${t.provider}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return json({ checked: tokens?.length ?? 0, refreshed, failures });
});
