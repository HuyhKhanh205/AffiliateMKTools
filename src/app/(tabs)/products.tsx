import { router } from 'expo-router';
import { useState } from 'react';

import { ProductRow } from '@/components/ProductRow';
import { Button, Chip, Empty, ErrorText, Field, H1, Muted, Row, Screen } from '@/components/ui';
import { unwrap, useFocusedQuery } from '@/lib/data';
import { PLATFORM_LABELS } from '@/lib/platform';
import { supabase } from '@/lib/supabase';
import { PLATFORMS, Platform, Product } from '@/lib/types';

export default function Products() {
  const [filter, setFilter] = useState<Platform | 'all'>('all');
  const [query, setQuery] = useState('');
  const { data, error, loading, refresh } = useFocusedQuery(async () =>
    unwrap(await supabase.from('products').select('*').order('sort_order').order('created_at', { ascending: false })) as Product[],
  );

  const q = query.trim().toLowerCase();
  const items = (data ?? []).filter((p) => (filter === 'all' || p.platform === filter) && (!q || p.title.toLowerCase().includes(q)));

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>Sản phẩm</H1>
        <Button small title="+ Thêm" onPress={() => router.push('/product/new')} />
      </Row>
      <Field label="Tìm kiếm" value={query} onChangeText={setQuery} placeholder="Tên sản phẩm..." />
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label="Tất cả" active={filter === 'all'} onPress={() => setFilter('all')} />
        {PLATFORMS.map((p) => (
          <Chip key={p} label={PLATFORM_LABELS[p]} active={filter === p} onPress={() => setFilter(p)} />
        ))}
      </Row>
      <ErrorText message={error} />
      {data && items.length === 0 ? (
        <Empty title={data.length ? 'Không có sản phẩm khớp' : 'Chưa có sản phẩm'}>
          <Muted>Dán link sản phẩm Shopee / Lazada / Tiki / TikTok Shop để bắt đầu.</Muted>
        </Empty>
      ) : null}
      {items.map((p) => (
        <ProductRow key={p.id} product={p} right={p.commission_rate ? `HH ${p.commission_rate}%` : undefined} />
      ))}
    </Screen>
  );
}
