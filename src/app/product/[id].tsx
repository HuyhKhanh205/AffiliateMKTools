import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Share, Switch, Text, View } from 'react-native';

import {
  BarChart,
  Button,
  Card,
  Chip,
  CopyButton,
  ErrorText,
  Field,
  H2,
  Loading,
  Muted,
  PlatformBadge,
  Row,
  Screen,
  colors,
} from '@/components/ui';
import { parseNumber } from '@/lib/csv';
import { unwrap, useFocusedQuery } from '@/lib/data';
import { CHANNEL_LABELS, buildTrackedUrl } from '@/lib/links';
import { formatVnd, normalizeUrl } from '@/lib/platform';
import { lastDays } from '@/lib/stats';
import { SHORT_LINK_BASE, invokeFunction, supabase } from '@/lib/supabase';
import { AiContent, CHANNELS, Channel, DailyClickRow, PricePoint, Product, TrackedLink } from '@/lib/types';

const SHAREABLE_CHANNELS = CHANNELS.filter((c) => c !== 'bio');

async function loadProduct(id: string) {
  const since = lastDays(new Date(), 30)[0];
  const [product, links, prices, clicks] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase.from('links').select('*').eq('product_id', id).order('created_at'),
    supabase.from('price_history').select('price, checked_at').eq('product_id', id).order('checked_at', { ascending: false }).limit(30),
    supabase.from('daily_clicks').select('*').eq('product_id', id).gte('day', since),
  ]);
  const clicksByChannel: Partial<Record<Channel, number>> = {};
  for (const row of unwrap(clicks) as DailyClickRow[]) {
    clicksByChannel[row.channel] = (clicksByChannel[row.channel] ?? 0) + row.clicks;
  }
  return {
    product: unwrap(product) as Product,
    links: unwrap(links) as TrackedLink[],
    prices: (unwrap(prices) as PricePoint[]).reverse(),
    clicksByChannel,
  };
}

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refresh } = useFocusedQuery(() => loadProduct(id), id);

  if (!data) {
    return (
      <Screen>
        {loading ? <Loading /> : null}
        <ErrorText message={error} />
      </Screen>
    );
  }

  const { product, links, prices, clicksByChannel } = data;
  const existingChannels = new Set(links.map((l) => l.channel));

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <Stack.Screen options={{ title: product.title.slice(0, 40) }} />
      <ErrorText message={error} />

      <Card>
        <Row style={{ alignItems: 'flex-start' }}>
          {product.image_url ? (
            <Image source={{ uri: product.image_url }} style={{ width: 84, height: 84, borderRadius: 10 }} contentFit="cover" />
          ) : null}
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{product.title}</Text>
            <Row>
              <PlatformBadge platform={product.platform} />
              {product.is_deal ? <Text style={{ color: colors.primary, fontWeight: '700' }}>🔥 Deal</Text> : null}
            </Row>
            <Text style={{ fontSize: 18, fontWeight: '700' }}>{formatVnd(product.current_price)}</Text>
            <Muted>
              Mục tiêu: {formatVnd(product.target_price)} · Hoa hồng: {product.commission_rate ?? '–'}%
            </Muted>
          </View>
        </Row>
        <Row>
          <Button small variant="secondary" title="Mở trên sàn" onPress={() => Linking.openURL(product.original_url)} />
          <Button small variant="secondary" title="Mở link affiliate" onPress={() => Linking.openURL(product.affiliate_url)} />
        </Row>
      </Card>

      <LinksSection product={product} links={links} clicksByChannel={clicksByChannel} existing={existingChannels} onChange={refresh} />
      <AiSection product={product} links={links} />
      <PriceSection product={product} prices={prices} onChange={refresh} />
      <EditSection product={product} onChange={refresh} />
    </Screen>
  );
}

function LinksSection({
  product,
  links,
  clicksByChannel,
  existing,
  onChange,
}: {
  product: Product;
  links: TrackedLink[];
  clicksByChannel: Partial<Record<Channel, number>>;
  existing: Set<Channel>;
  onChange: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const missing = SHAREABLE_CHANNELS.filter((c) => !existing.has(c));

  async function addLink(channel: Channel) {
    setError(null);
    const { error: e } = await supabase.from('links').insert({ product_id: product.id, channel });
    if (e) setError(e.message);
    else onChange();
  }

  return (
    <Card>
      <H2>Link theo dõi</H2>
      <Muted>Mỗi kênh một link riêng để biết kênh nào ra click. Click 30 ngày qua:</Muted>
      {links.map((link) => {
        const url = buildTrackedUrl(SHORT_LINK_BASE, link.slug);
        return (
          <View key={link.id} style={{ gap: 6, paddingVertical: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600' }}>{CHANNEL_LABELS[link.channel]}</Text>
              <Text>{clicksByChannel[link.channel] ?? 0} click</Text>
            </Row>
            <Text selectable style={{ color: colors.muted, fontSize: 12 }}>
              {url}
            </Text>
            <Row>
              <CopyButton text={url} />
              <Button small variant="secondary" title="Chia sẻ" onPress={() => Share.share({ message: `${product.title}\n${url}` })} />
            </Row>
          </View>
        );
      })}
      {missing.length ? (
        <>
          <Muted>Tạo thêm link cho kênh:</Muted>
          <Row style={{ flexWrap: 'wrap' }}>
            {missing.map((c) => (
              <Chip key={c} label={`+ ${CHANNEL_LABELS[c]}`} onPress={() => addLink(c)} />
            ))}
          </Row>
        </>
      ) : null}
      <ErrorText message={error} />
    </Card>
  );
}

function AiSection({ product, links }: { product: Product; links: TrackedLink[] }) {
  const [channel, setChannel] = useState<Channel>('tiktok');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ content: AiContent; remaining: number } | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setResult(await invokeFunction('ai-content', { product_id: product.id, channel, notes: notes.trim() || undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const link = links.find((l) => l.channel === channel) ?? links.find((l) => l.channel === 'bio');
  const fullText = result
    ? [result.content.hook, result.content.caption, result.content.cta, link ? buildTrackedUrl(SHORT_LINK_BASE, link.slug) : '', result.content.hashtags.join(' ')]
        .filter(Boolean)
        .join('\n\n')
    : '';

  return (
    <Card>
      <H2>✨ Viết nội dung bằng AI</H2>
      <Row style={{ flexWrap: 'wrap' }}>
        {(['tiktok', 'facebook', 'instagram', 'zalo', 'youtube'] as Channel[]).map((c) => (
          <Chip key={c} label={CHANNEL_LABELS[c]} active={channel === c} onPress={() => setChannel(c)} />
        ))}
      </Row>
      <Field
        label="Điểm nổi bật / trải nghiệm thật (tuỳ chọn)"
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="VD: pin 30 giờ, đeo cả ngày không đau tai, mình dùng 2 tháng rồi..."
        hint="AI chỉ dùng thông tin bạn cung cấp, không bịa thông số. Ghi càng cụ thể, nội dung càng thật."
      />
      <Button title="Viết caption" onPress={generate} loading={busy} />
      <ErrorText message={error} />
      {result ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>{result.content.hook}</Text>
          <Text selectable>{result.content.caption}</Text>
          <Text style={{ fontWeight: '600' }}>{result.content.cta}</Text>
          <Text style={{ color: colors.primary }}>{result.content.hashtags.join(' ')}</Text>
          <Row style={{ justifyContent: 'space-between' }}>
            <CopyButton text={fullText} label="Copy tất cả (kèm link)" />
            <Muted style={{ fontSize: 12 }}>Còn {result.remaining} lượt hôm nay</Muted>
          </Row>
        </View>
      ) : null}
    </Card>
  );
}

function PriceSection({ product, prices, onChange }: { product: Product; prices: PricePoint[]; onChange: () => void }) {
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function addPrice() {
    const value = parseNumber(price);
    if (!value) return setError('Nhập giá hợp lệ.');
    setError(null);
    const { error: e } = await supabase.from('price_history').insert({ product_id: product.id, price: value });
    if (e) return setError(e.message);
    setPrice('');
    onChange();
  }

  return (
    <Card>
      <H2>Lịch sử giá</H2>
      {prices.length > 1 ? (
        <BarChart
          height={90}
          data={prices.map((p) => ({
            label: new Date(p.checked_at).toLocaleDateString('vi-VN'),
            value: Math.round(p.price / 1000),
          }))}
        />
      ) : (
        <Muted>Cần ít nhất 2 lần ghi giá để vẽ biểu đồ (đơn vị: nghìn đồng).</Muted>
      )}
      <Row style={{ alignItems: 'flex-end' }}>
        <Field label="Cập nhật giá (đ)" value={price} onChangeText={setPrice} keyboardType="numeric" containerStyle={{ flex: 1 }} />
        <Button title="Lưu" onPress={addPrice} />
      </Row>
      <Muted style={{ fontSize: 12 }}>
        {product.platform === 'shopee'
          ? 'Có Shopee API key thì giá tự cập nhật mỗi sáng.'
          : 'Sàn này chưa có API giá: cập nhật tay khi thấy giá đổi.'}
      </Muted>
      <ErrorText message={error} />
    </Card>
  );
}

function EditSection({ product, onChange }: { product: Product; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(product.title);
  const [affiliateUrl, setAffiliateUrl] = useState(product.affiliate_url);
  const [targetPrice, setTargetPrice] = useState(product.target_price?.toString() ?? '');
  const [commission, setCommission] = useState(product.commission_rate?.toString() ?? '');
  const [isPublic, setIsPublic] = useState(product.is_public);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const affiliate = normalizeUrl(affiliateUrl);
    if (!affiliate || !title.trim()) return setError('Tên và link affiliate không được trống.');
    const { error: e } = await supabase
      .from('products')
      .update({
        title: title.trim(),
        affiliate_url: affiliate,
        target_price: targetPrice ? parseNumber(targetPrice) : null,
        commission_rate: commission ? parseNumber(commission) : null,
        is_public: isPublic,
      })
      .eq('id', product.id);
    if (e) return setError(e.message);
    setError(null);
    setOpen(false);
    onChange();
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    const { error: e } = await supabase.from('products').delete().eq('id', product.id);
    if (e) return setError(e.message);
    router.back();
  }

  if (!open) return <Button variant="secondary" title="Sửa / xoá sản phẩm" onPress={() => setOpen(true)} />;

  return (
    <Card>
      <H2>Sửa sản phẩm</H2>
      <Field label="Tên" value={title} onChangeText={setTitle} />
      <Field label="Link affiliate" value={affiliateUrl} onChangeText={setAffiliateUrl} autoCapitalize="none" />
      <Row>
        <Field label="Giá mục tiêu (đ)" value={targetPrice} onChangeText={setTargetPrice} keyboardType="numeric" containerStyle={{ flex: 1 }} />
        <Field label="Hoa hồng (%)" value={commission} onChangeText={setCommission} keyboardType="numeric" containerStyle={{ flex: 1 }} />
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text>Hiện trên trang bio</Text>
        <Switch value={isPublic} onValueChange={setIsPublic} />
      </Row>
      <ErrorText message={error} />
      <Button title="Lưu thay đổi" onPress={save} />
      <Button variant="danger" title={confirmDelete ? 'Bấm lần nữa để xoá vĩnh viễn' : 'Xoá sản phẩm'} onPress={remove} />
    </Card>
  );
}
