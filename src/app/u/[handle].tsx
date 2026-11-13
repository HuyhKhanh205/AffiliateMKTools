import { Image } from 'expo-image';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Loading, Muted, PlatformBadge, Screen, colors } from '@/components/ui';
import { buildTrackedUrl } from '@/lib/links';
import { PLATFORM_LABELS, formatVnd } from '@/lib/platform';
import { SHORT_LINK_BASE, isConfigured, supabase } from '@/lib/supabase';
import { Platform } from '@/lib/types';

interface BioProduct {
  id: string;
  title: string;
  platform: Platform;
  image_url: string | null;
  current_price: number | null;
  is_deal: boolean;
  slug: string;
}

interface Bio {
  handle: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  products: BioProduct[];
}

/** Sample data so the page can be previewed before Supabase is configured. */
const DEMO: Bio = {
  handle: 'demo',
  display_name: 'Review Đồ Xịn Giá Rẻ',
  bio: 'Săn deal công nghệ & đồ gia dụng mỗi ngày 💸',
  avatar_url: null,
  products: [
    { id: '1', title: 'Tai nghe Bluetooth chống ồn, pin 30 giờ', platform: 'shopee', image_url: null, current_price: 349000, is_deal: true, slug: 'demo1' },
    { id: '2', title: 'Nồi chiên không dầu 5L', platform: 'lazada', image_url: null, current_price: 1290000, is_deal: false, slug: 'demo2' },
    { id: '3', title: 'Sách "Đắc Nhân Tâm" bìa cứng', platform: 'tiki', image_url: null, current_price: 86000, is_deal: false, slug: 'demo3' },
    { id: '4', title: 'Son kem lì mềm môi', platform: 'tiktok', image_url: null, current_price: 159000, is_deal: true, slug: 'demo4' },
  ],
};

export default function BioPage() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const [loaded, setLoaded] = useState<{ handle: string; bio: Bio | null } | null>(null);

  useEffect(() => {
    if (!isConfigured) return;
    supabase
      .rpc('get_bio', { p_handle: handle })
      .then(({ data, error }) => setLoaded({ handle, bio: error ? null : ((data as Bio | null) ?? null) }));
  }, [handle]);

  // Without Supabase configured, /u/demo shows sample data so the page can be previewed.
  const bio: Bio | null | undefined = !isConfigured
    ? handle === 'demo'
      ? DEMO
      : null
    : loaded?.handle === handle
      ? loaded.bio
      : undefined;

  if (bio === undefined) return <Loading />;

  return (
    <Screen>
      <Stack.Screen options={{ title: bio?.display_name ?? handle }} />
      {bio === null ? (
        <View style={styles.header}>
          <Text style={styles.name}>Không tìm thấy trang @{handle}</Text>
        </View>
      ) : (
        <>
          <View style={styles.header}>
            {bio.avatar_url ? (
              <Image source={{ uri: bio.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={{ fontSize: 30, color: '#fff' }}>{(bio.display_name ?? bio.handle).charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.name}>{bio.display_name ?? `@${bio.handle}`}</Text>
            {bio.bio ? <Muted style={{ textAlign: 'center' }}>{bio.bio}</Muted> : null}
          </View>

          {bio.products.length === 0 ? <Muted style={{ textAlign: 'center' }}>Chưa có sản phẩm.</Muted> : null}

          {bio.products.map((p) => (
            <Link key={p.id} href={buildTrackedUrl(SHORT_LINK_BASE, p.slug) as never} asChild>
              <Pressable style={styles.card}>
                {p.image_url ? (
                  <Image source={{ uri: p.image_url }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 26 }}>🛍️</Text>
                  </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.title} numberOfLines={2}>
                    {p.title}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <PlatformBadge platform={p.platform} />
                    {p.is_deal ? <Text style={styles.deal}>🔥 Đang giảm giá</Text> : null}
                  </View>
                  <Text style={styles.price}>{p.current_price ? formatVnd(p.current_price) : ''}</Text>
                </View>
                <View style={styles.buy}>
                  <Text style={styles.buyText}>Mua trên{'\n'}{PLATFORM_LABELS[p.platform]}</Text>
                </View>
              </Pressable>
            </Link>
          ))}

          <Muted style={{ textAlign: 'center', fontSize: 11, marginTop: 8 }}>
            Các link trên là link affiliate: mình nhận hoa hồng nhỏ nếu bạn mua qua link, giá bạn trả không đổi.
          </Muted>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.bg },
  title: { fontSize: 14, fontWeight: '600', color: colors.text },
  price: { fontSize: 15, fontWeight: '700', color: colors.primary },
  deal: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  buy: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  buyText: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
