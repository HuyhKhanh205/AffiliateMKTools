// Pure helpers shared with the Edge Functions (single source of truth lives next to them).
export { threadsLength, titleFromUrl } from '../../supabase/functions/_shared/slug-title';

export const PROVIDER_LABELS = { threads: 'Threads', instagram: 'Instagram', tiktok: 'TikTok' } as const;
