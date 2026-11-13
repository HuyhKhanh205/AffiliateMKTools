import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { shortLinkBase } from './links';
import { authStorage } from './storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** False until .env.local is filled in — screens show setup instructions instead of crashing. */
export const isConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = createClient(
  supabaseUrl || 'https://not-configured.supabase.co',
  supabaseKey || 'not-configured',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  },
);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const SHORT_LINK_BASE = shortLinkBase(supabaseUrl, process.env.EXPO_PUBLIC_SHORT_LINK_BASE);

/** Public site URL (where the web build is hosted), used to show the bio page link. */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');

/** Calls an Edge Function and turns its `{ error }` body into a thrown Error with a readable message. */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const parsed = await context.json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // keep the generic message
      }
    }
    throw new Error(message);
  }
  return data as T;
}
