import { accesstrade } from './accesstrade.ts';
import { shopee } from './shopee.ts';
import { Platform, Provider } from './types.ts';

export * from './types.ts';

const PROVIDERS: Provider[] = [shopee, accesstrade];

/** The configured provider for a platform, or null (TikTok Shop has none: manual entry). */
export function providerFor(platform: Platform): Provider | null {
  return PROVIDERS.find((p) => p.platforms.includes(platform) && p.configured()) ?? null;
}
