import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';

import { unwrap, useFocusedQuery } from '@/lib/data';
import { PROVIDER_LABELS } from '@/lib/social';
import { invokeFunction, supabase } from '@/lib/supabase';
import { SocialAccount } from '@/lib/types';

import { Button, Card, CopyButton, ErrorText, H2, Muted, Row, colors } from './ui';

type MetaProvider = 'threads' | 'instagram';

/** "Kết nối kênh" section of Settings: connect/disconnect Threads and Instagram. */
export function SocialConnections({ userId, bioUrl }: { userId: string; bioUrl: string | null }) {
  const params = useLocalSearchParams<{ connected?: string; social_error?: string }>();
  const { data, refresh } = useFocusedQuery(async () => {
    const [accounts, status] = await Promise.all([
      supabase.from('social_accounts').select('*'),
      invokeFunction<{ configured: Record<MetaProvider, boolean> }>('social-oauth', { action: 'status' }).catch(() => null),
    ]);
    return { accounts: unwrap(accounts) as SocialAccount[], configured: status?.configured ?? null };
  }, userId);
  const [busy, setBusy] = useState<MetaProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.connected) refresh();
  }, [params.connected, refresh]);

  async function connect(provider: MetaProvider) {
    setError(null);
    setBusy(provider);
    try {
      const { url } = await invokeFunction<{ url: string }>('social-oauth', { action: 'start', provider });
      // Meta redirects back to <site>/settings?connected=<provider> when done.
      if (Platform.OS === 'web') window.location.assign(url);
      else await Linking.openURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function disconnect(provider: MetaProvider) {
    setBusy(provider);
    try {
      await invokeFunction('social-oauth', { action: 'disconnect', provider });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const accounts = new Map((data?.accounts ?? []).map((a) => [a.provider, a]));

  return (
    <Card>
      <H2>Kết nối kênh (đăng tự động)</H2>
      <Muted>Kết nối một lần, sau đó ở tab Đăng bài chỉ cần dán link và bấm Đăng.</Muted>
      {params.connected ? (
        <Text style={{ color: colors.success }}>Đã kết nối {PROVIDER_LABELS[params.connected as MetaProvider] ?? params.connected} ✓</Text>
      ) : null}
      <ErrorText message={params.social_error ?? error} />

      {(['threads', 'instagram'] as MetaProvider[]).map((p) => {
        const account = accounts.get(p);
        const notConfigured = data?.configured && !data.configured[p];
        return (
          <View key={p} style={{ gap: 4, paddingVertical: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>{PROVIDER_LABELS[p]}</Text>
                <Muted style={{ fontSize: 12 }}>
                  {account
                    ? `@${account.username ?? account.account_id} ✓${account.expires_at ? ` · tự gia hạn, hạn hiện tại ${new Date(account.expires_at).toLocaleDateString('vi-VN')}` : ''}`
                    : notConfigured
                      ? 'Cần tạo app Meta trước (xem README, mục "Kết nối Threads/Instagram")'
                      : 'Chưa kết nối'}
                </Muted>
              </View>
              {account ? (
                <Button small variant="secondary" title="Ngắt" onPress={() => disconnect(p)} loading={busy === p} />
              ) : (
                <Button small title="Kết nối" onPress={() => connect(p)} loading={busy === p} disabled={!!notConfigured} />
              )}
            </Row>
            {p === 'instagram' ? (
              <Muted style={{ fontSize: 12 }}>
                Cần tài khoản Instagram Chuyên nghiệp (Cài đặt IG → Loại tài khoản → Chuyển sang tài khoản chuyên nghiệp).
              </Muted>
            ) : null}
          </View>
        );
      })}

      {accounts.has('instagram') && bioUrl ? (
        <View style={{ gap: 6 }}>
          <Muted style={{ fontSize: 12 }}>Link trong caption Instagram không bấm được. Dán link trang bio này vào phần Trang web trên hồ sơ IG:</Muted>
          <Row>
            <Text selectable style={{ flex: 1, color: colors.primary, fontSize: 12 }}>
              {bioUrl}
            </Text>
            <CopyButton text={bioUrl} />
          </Row>
        </View>
      ) : null}
    </Card>
  );
}
