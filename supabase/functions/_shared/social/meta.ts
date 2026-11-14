// Threads API and Instagram API with Instagram Login — OAuth and publishing.
// Endpoints follow Meta's docs (read 2026-11-14):
//   Threads:   https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
//              https://developers.facebook.com/docs/threads/get-started/long-lived-tokens
//              https://developers.facebook.com/docs/threads/posts
//   Instagram: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
//              https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing

export type MetaProvider = 'threads' | 'instagram';

const THREADS_GRAPH = 'https://graph.threads.com';
const THREADS_VERSION = 'v1.0';
const IG_GRAPH = 'https://graph.instagram.com';
const IG_VERSION = 'v27.0';

export interface TokenResult {
  accessToken: string;
  expiresAt: Date;
}

export interface Profile {
  accountId: string;
  username: string | null;
}

export interface PublishResult {
  externalId: string;
  permalink: string | null;
}

export class MetaApiError extends Error {}

function creds(provider: MetaProvider): { appId: string; appSecret: string } {
  const prefix = provider === 'threads' ? 'THREADS' : 'INSTAGRAM';
  const appId = Deno.env.get(`${prefix}_APP_ID`);
  const appSecret = Deno.env.get(`${prefix}_APP_SECRET`);
  if (!appId || !appSecret) {
    throw new MetaApiError(`Chưa cấu hình ${prefix}_APP_ID / ${prefix}_APP_SECRET (Supabase → Edge Functions → Secrets).`);
  }
  return { appId, appSecret };
}

export function isConfigured(provider: MetaProvider): boolean {
  const prefix = provider === 'threads' ? 'THREADS' : 'INSTAGRAM';
  return Boolean(Deno.env.get(`${prefix}_APP_ID`) && Deno.env.get(`${prefix}_APP_SECRET`));
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok || body.error || body.error_message) {
    const err = body.error as { message?: string } | undefined;
    throw new MetaApiError(String(err?.message ?? body.error_message ?? body.raw ?? `HTTP ${res.status}`));
  }
  return body;
}

export function authorizeUrl(provider: MetaProvider, redirectUri: string, state: string): string {
  const { appId } = creds(provider);
  const url =
    provider === 'threads'
      ? new URL('https://threads.com/oauth/authorize')
      : new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set(
    'scope',
    provider === 'threads' ? 'threads_basic,threads_content_publish' : 'instagram_business_basic,instagram_business_content_publish',
  );
  url.searchParams.set('state', state);
  if (provider === 'instagram') url.searchParams.set('enable_fb_login', 'false');
  return url.toString();
}

/** Authorization code -> short-lived token -> long-lived (60-day) token. */
export async function exchangeCode(provider: MetaProvider, code: string, redirectUri: string): Promise<TokenResult> {
  const { appId, appSecret } = creds(provider);
  const form = new FormData();
  form.set('client_id', appId);
  form.set('client_secret', appSecret);
  form.set('grant_type', 'authorization_code');
  form.set('redirect_uri', redirectUri);
  form.set('code', code.replace(/#_$/, ''));

  const shortUrl = provider === 'threads' ? `${THREADS_GRAPH}/oauth/access_token` : 'https://api.instagram.com/oauth/access_token';
  const short = await readJson(await fetch(shortUrl, { method: 'POST', body: form }));
  // Instagram wraps the answer in { data: [ ... ] }; Threads returns it flat.
  const shortToken = String((short.data as { access_token: string }[] | undefined)?.[0]?.access_token ?? short.access_token);

  const longUrl =
    provider === 'threads'
      ? new URL(`${THREADS_GRAPH}/access_token`)
      : new URL(`${IG_GRAPH}/access_token`);
  longUrl.searchParams.set('grant_type', provider === 'threads' ? 'th_exchange_token' : 'ig_exchange_token');
  longUrl.searchParams.set('client_secret', appSecret);
  longUrl.searchParams.set('access_token', shortToken);
  const long = await readJson(await fetch(longUrl));
  return { accessToken: String(long.access_token), expiresAt: new Date(Date.now() + Number(long.expires_in ?? 0) * 1000) };
}

/** Refreshes an unexpired long-lived token for another 60 days. */
export async function refreshToken(provider: MetaProvider, accessToken: string): Promise<TokenResult> {
  const url =
    provider === 'threads'
      ? new URL(`${THREADS_GRAPH}/refresh_access_token`)
      : new URL(`${IG_GRAPH}/refresh_access_token`);
  url.searchParams.set('grant_type', provider === 'threads' ? 'th_refresh_token' : 'ig_refresh_token');
  url.searchParams.set('access_token', accessToken);
  const body = await readJson(await fetch(url));
  return { accessToken: String(body.access_token), expiresAt: new Date(Date.now() + Number(body.expires_in ?? 0) * 1000) };
}

export async function fetchProfile(provider: MetaProvider, accessToken: string): Promise<Profile> {
  const url =
    provider === 'threads'
      ? new URL(`${THREADS_GRAPH}/${THREADS_VERSION}/me`)
      : new URL(`${IG_GRAPH}/${IG_VERSION}/me`);
  url.searchParams.set('fields', provider === 'threads' ? 'id,username' : 'user_id,username');
  url.searchParams.set('access_token', accessToken);
  const body = await readJson(await fetch(url));
  return { accountId: String(provider === 'threads' ? body.id : body.user_id ?? body.id), username: (body.username as string) ?? null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  return readJson(await fetch(url, { method: 'POST', body: new URLSearchParams(params) }));
}

/** Polls a media container until it is ready (Threads: status, Instagram: status_code). */
async function waitForContainer(base: string, containerId: string, field: 'status' | 'status_code', token: string) {
  for (let i = 0; i < 15; i++) {
    const url = new URL(`${base}/${containerId}`);
    url.searchParams.set('fields', field === 'status' ? 'status,error_message' : 'status_code');
    url.searchParams.set('access_token', token);
    const body = await readJson(await fetch(url));
    const status = String(body[field] ?? '');
    if (status === 'FINISHED' || status === 'PUBLISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new MetaApiError(`Nền tảng không xử lý được nội dung (${status}${body.error_message ? `: ${body.error_message}` : ''}).`);
    }
    await sleep(2000);
  }
  throw new MetaApiError('Nền tảng xử lý ảnh quá lâu, thử lại sau ít phút.');
}

async function permalinkOf(base: string, mediaId: string, token: string): Promise<string | null> {
  try {
    const url = new URL(`${base}/${mediaId}`);
    url.searchParams.set('fields', 'permalink');
    url.searchParams.set('access_token', token);
    return ((await readJson(await fetch(url))).permalink as string) ?? null;
  } catch {
    return null;
  }
}

export async function publishThreads(
  accountId: string,
  token: string,
  text: string,
  opts: { imageUrl?: string | null; link?: string | null },
): Promise<PublishResult> {
  const base = `${THREADS_GRAPH}/${THREADS_VERSION}`;
  const params: Record<string, string> = { access_token: token, text };
  if (opts.imageUrl) {
    params.media_type = 'IMAGE';
    params.image_url = opts.imageUrl;
  } else {
    params.media_type = 'TEXT';
    // link_attachment works for text-only posts (shown as a preview card).
    if (opts.link) params.link_attachment = opts.link;
  }
  const container = await post(`${base}/${accountId}/threads`, params);
  const containerId = String(container.id);
  await waitForContainer(base, containerId, 'status', token);
  const published = await post(`${base}/${accountId}/threads_publish`, { access_token: token, creation_id: containerId });
  const id = String(published.id);
  return { externalId: id, permalink: await permalinkOf(base, id, token) };
}

export async function publishInstagram(accountId: string, token: string, caption: string, imageUrl: string): Promise<PublishResult> {
  const base = `${IG_GRAPH}/${IG_VERSION}`;
  const container = await post(`${base}/${accountId}/media`, { access_token: token, image_url: imageUrl, caption });
  const containerId = String(container.id);
  await waitForContainer(base, containerId, 'status_code', token);
  const published = await post(`${base}/${accountId}/media_publish`, { access_token: token, creation_id: containerId });
  const id = String(published.id);
  return { externalId: id, permalink: await permalinkOf(base, id, token) };
}
