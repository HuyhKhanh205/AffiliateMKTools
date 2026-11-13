import { ProductRow } from '@/components/ProductRow';
import { Empty, ErrorText, H1, H2, Muted, Screen } from '@/components/ui';
import { unwrap, useFocusedQuery } from '@/lib/data';
import { formatVnd } from '@/lib/platform';
import { supabase } from '@/lib/supabase';
import { Product } from '@/lib/types';

export default function Deals() {
  const { data, error, loading, refresh } = useFocusedQuery(
    async () =>
      unwrap(await supabase.from('products').select('*').not('current_price', 'is', null).order('price_updated_at', { ascending: false })) as Product[],
  );

  const deals = (data ?? []).filter((p) => p.is_deal);
  // Within 10% of the target price: worth watching.
  const close = (data ?? []).filter(
    (p) => !p.is_deal && p.target_price && p.current_price && p.current_price <= p.target_price * 1.1,
  );

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <H1>Deal 🔥</H1>
      <Muted>Sản phẩm chạm giá mục tiêu hoặc giảm ≥15% so với giá trung bình 30 ngày. Đăng ngay khi deal còn hot!</Muted>
      <ErrorText message={error} />

      {data && deals.length === 0 ? (
        <Empty title="Chưa có deal">
          <Muted style={{ textAlign: 'center' }}>Đặt giá mục tiêu cho sản phẩm và cập nhật giá (hoặc bật Shopee API để tự động).</Muted>
        </Empty>
      ) : null}
      {deals.map((p) => (
        <ProductRow key={p.id} product={p} right={p.target_price ? `Mục tiêu ${formatVnd(p.target_price)}` : undefined} />
      ))}

      {close.length ? (
        <>
          <H2>Sắp chạm giá mục tiêu</H2>
          {close.map((p) => (
            <ProductRow key={p.id} product={p} right={`Mục tiêu ${formatVnd(p.target_price)}`} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
