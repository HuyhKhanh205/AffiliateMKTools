import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatVnd } from '@/lib/platform';
import { Product } from '@/lib/types';

import { colors, PlatformBadge } from './ui';

export function ProductRow({ product, right }: { product: Product; right?: string }) {
  return (
    <Link href={{ pathname: '/product/[id]', params: { id: product.id } }} asChild>
      <Pressable style={styles.row}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.placeholder]}>
            <Text style={{ fontSize: 22 }}>🛍️</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title} numberOfLines={2}>
            {product.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <PlatformBadge platform={product.platform} />
            {product.is_deal ? <Text style={styles.deal}>🔥 Deal</Text> : null}
            {!product.is_public ? <Text style={styles.hidden}>Ẩn khỏi bio</Text> : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={styles.price}>{formatVnd(product.current_price)}</Text>
          {right ? <Text style={styles.right}>{right}</Text> : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.bg },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 14, fontWeight: '500' },
  price: { color: colors.text, fontWeight: '700' },
  right: { color: colors.muted, fontSize: 12 },
  deal: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  hidden: { color: colors.muted, fontSize: 11 },
});
