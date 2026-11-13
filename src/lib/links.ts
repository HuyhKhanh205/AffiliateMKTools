import { Channel } from './types';

export const CHANNEL_LABELS: Record<Channel, string> = {
  tiktok: 'TikTok',
  facebook: 'Facebook',
  instagram: 'Instagram',
  zalo: 'Zalo',
  youtube: 'YouTube',
  bio: 'Trang bio',
  other: 'Khác',
};

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no look-alike chars (l, 1, o, 0)

/** Random short slug for a tracked link. `random` is injectable for tests. */
export function generateSlug(length = 7, random: () => number = Math.random): string {
  let slug = '';
  for (let i = 0; i < length; i++) {
    slug += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return slug;
}

/**
 * Base URL of the redirect function. Defaults to the Supabase Edge Function
 * `go`; set EXPO_PUBLIC_SHORT_LINK_BASE to use a custom domain instead.
 */
export function shortLinkBase(
  supabaseUrl: string | undefined,
  override: string | undefined,
): string {
  if (override) return override.replace(/\/+$/, '');
  if (!supabaseUrl) return '';
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/go`;
}

/** Builds the public tracked URL for a slug, e.g. https://x.supabase.co/functions/v1/go/abc1234 */
export function buildTrackedUrl(base: string, slug: string): string {
  return `${base}/${encodeURIComponent(slug)}`;
}
