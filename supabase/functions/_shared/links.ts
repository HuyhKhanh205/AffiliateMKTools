import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

/** Public tracked URL for a slug (the `go` function, or SHORT_LINK_BASE when a custom domain proxies it). */
export function trackedUrl(slug: string): string {
  const base = (Deno.env.get('SHORT_LINK_BASE') || `${Deno.env.get('SUPABASE_URL')}/functions/v1/go`).replace(/\/+$/, '');
  return `${base}/${slug}`;
}

/** Returns the slug of the product's link for a channel, creating the link if needed. */
export async function ensureLinkSlug(admin: SupabaseClient, userId: string, productId: string, channel: string): Promise<string> {
  const existing = await admin.from('links').select('slug').eq('product_id', productId).eq('channel', channel).maybeSingle();
  if (existing.data?.slug) return existing.data.slug;
  const created = await admin
    .from('links')
    .upsert({ user_id: userId, product_id: productId, channel }, { onConflict: 'product_id,channel', ignoreDuplicates: true })
    .select('slug')
    .maybeSingle();
  if (created.data?.slug) return created.data.slug;
  const again = await admin.from('links').select('slug').eq('product_id', productId).eq('channel', channel).single();
  if (again.error) throw new Error(again.error.message);
  return again.data.slug;
}

/** Public bio page of the user, if they set a handle. */
export async function bioUrlFor(admin: SupabaseClient, userId: string): Promise<string | null> {
  const site = (Deno.env.get('APP_SITE_URL') ?? '').replace(/\/+$/, '');
  if (!site) return null;
  const { data } = await admin.from('profiles').select('handle').eq('id', userId).maybeSingle();
  return data?.handle ? `${site}/u/${data.handle}` : null;
}
