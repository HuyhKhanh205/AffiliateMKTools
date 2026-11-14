export const PLATFORMS = ['shopee', 'lazada', 'tiki', 'tiktok'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CHANNELS = ['tiktok', 'facebook', 'instagram', 'threads', 'zalo', 'youtube', 'bio', 'other'] as const;
export type Channel = (typeof CHANNELS)[number];

export type ConversionStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

export interface Product {
  id: string;
  user_id: string;
  platform: Platform;
  title: string;
  image_url: string | null;
  original_url: string;
  affiliate_url: string;
  current_price: number | null;
  target_price: number | null;
  commission_rate: number | null;
  is_public: boolean;
  is_deal: boolean;
  price_updated_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface TrackedLink {
  id: string;
  product_id: string;
  slug: string;
  channel: Channel;
  created_at: string;
}

export interface DailyClickRow {
  day: string; // YYYY-MM-DD
  product_id: string;
  platform: Platform;
  channel: Channel;
  clicks: number;
}

export interface Conversion {
  id?: string;
  platform: Platform;
  product_id?: string | null;
  external_order_id: string | null;
  order_date: string; // YYYY-MM-DD
  order_amount: number;
  commission: number;
  status: ConversionStatus;
  source: 'manual' | 'csv';
}

export interface PricePoint {
  price: number;
  checked_at: string;
}

export interface AiContent {
  hook: string;
  caption: string;
  hashtags: string[];
  cta: string;
}

export type SocialProvider = 'threads' | 'instagram' | 'tiktok';

export interface SocialAccount {
  provider: SocialProvider;
  account_id: string;
  username: string | null;
  expires_at: string | null;
  connected_at: string;
}

export interface Post {
  id: string;
  product_id: string | null;
  provider: SocialProvider;
  text: string;
  image_url: string | null;
  status: 'publishing' | 'published' | 'failed';
  permalink: string | null;
  error: string | null;
  created_at: string;
}
