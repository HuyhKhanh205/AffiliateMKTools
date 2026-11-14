import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, Text } from 'react-native';

import { Button, Card, Chip, ErrorText, Field, Muted, Row, Screen, colors } from '@/components/ui';
import { parseNumber } from '@/lib/csv';
import { PLATFORM_LABELS, detectPlatform, normalizeUrl } from '@/lib/platform';
import { invokeFunction, supabase } from '@/lib/supabase';
import { PLATFORMS, Platform } from '@/lib/types';

interface LookupResponse {
  configured: boolean;
  affiliate_url?: string;
  title?: string;
  image_url?: string;
  price?: number;
  commission_rate?: number;
}

export default function NewProduct() {
  const [originalUrl, setOriginalUrl] = useState('');
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [price, setPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [commission, setCommission] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function onUrlChange(text: string) {
    setOriginalUrl(text);
    const detected = detectPlatform(text);
    if (detected) setPlatform(detected);
  }

  async function lookup() {
    setError(null);
    setNote(null);
    const url = normalizeUrl(originalUrl);
    if (!url || !platform) {
      setError('Dán link sản phẩm hợp lệ và chọn sàn trước.');
      return;
    }
    setLookingUp(true);
    try {
      const res = await invokeFunction<LookupResponse>('product-lookup', { url, platform });
      if (res.title && !title) setTitle(res.title);
      if (res.image_url && !imageUrl) setImageUrl(res.image_url);
      if (!res.configured) {
        setNote(
          `Đã đoán tên sản phẩm từ link. Chưa có API ${PLATFORM_LABELS[platform]} nên không tự tạo được link affiliate: nếu link trên đã là link affiliate thì để trống ô bên dưới.`,
        );
        return;
      }
      if (res.affiliate_url) setAffiliateUrl(res.affiliate_url);
      if (res.title && !title) setTitle(res.title);
      if (res.image_url && !imageUrl) setImageUrl(res.image_url);
      if (res.price && !price) setPrice(String(res.price));
      if (res.commission_rate && !commission) setCommission(String(res.commission_rate));
      setNote('Đã lấy thông tin từ API ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLookingUp(false);
    }
  }

  async function save() {
    setError(null);
    const original = normalizeUrl(originalUrl);
    const affiliate = normalizeUrl(affiliateUrl || originalUrl);
    if (!original || !affiliate) return setError('Link sản phẩm không hợp lệ.');
    if (!platform) return setError('Chọn sàn của sản phẩm.');
    if (!title.trim()) return setError('Nhập tên sản phẩm.');

    setBusy(true);
    const { data, error: insertError } = await supabase
      .from('products')
      .insert({
        platform,
        title: title.trim(),
        original_url: original,
        affiliate_url: affiliate,
        image_url: normalizeUrl(imageUrl),
        target_price: targetPrice ? parseNumber(targetPrice) : null,
        commission_rate: commission ? parseNumber(commission) : null,
        is_public: isPublic,
      })
      .select('id')
      .single();
    if (insertError || !data) {
      setBusy(false);
      return setError(insertError?.message ?? 'Không lưu được.');
    }
    if (price) {
      // The apply_price trigger copies this into products.current_price.
      await supabase.from('price_history').insert({ product_id: data.id, price: parseNumber(price) });
    }
    setBusy(false);
    router.replace({ pathname: '/product/[id]', params: { id: data.id } });
  }

  return (
    <Screen>
      <Card>
        <Field
          label="Link sản phẩm"
          value={originalUrl}
          onChangeText={onUrlChange}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://shopee.vn/..."
        />
        <Row style={{ flexWrap: 'wrap' }}>
          {PLATFORMS.map((p) => (
            <Chip key={p} label={PLATFORM_LABELS[p]} active={platform === p} onPress={() => setPlatform(p)} />
          ))}
        </Row>
        <Button variant="secondary" title="⚡ Tự tạo link affiliate & lấy thông tin" onPress={lookup} loading={lookingUp} />
        {note ? <Muted>{note}</Muted> : null}
        <Field
          label="Link affiliate"
          value={affiliateUrl}
          onChangeText={setAffiliateUrl}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="Link rút gọn từ Shopee Affiliate / AccessTrade / TikTok"
          hint="Để trống sẽ dùng link sản phẩm. Người xem bấm link theo dõi của app sẽ được chuyển tới link này."
        />
      </Card>

      <Card>
        <Field label="Tên sản phẩm" value={title} onChangeText={setTitle} placeholder="VD: Tai nghe Bluetooth XYZ" />
        <Field label="Link ảnh (tuỳ chọn)" value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" keyboardType="url" />
        <Row>
          <Field label="Giá hiện tại (đ)" value={price} onChangeText={setPrice} keyboardType="numeric" containerStyle={{ flex: 1 }} />
          <Field
            label="Giá mục tiêu (đ)"
            value={targetPrice}
            onChangeText={setTargetPrice}
            keyboardType="numeric"
            containerStyle={{ flex: 1 }}
          />
        </Row>
        <Muted style={{ fontSize: 12 }}>Khi giá ≤ giá mục tiêu hoặc giảm ≥15% so với trung bình 30 ngày, sản phẩm hiện ở tab Deal.</Muted>
        <Field label="Hoa hồng (%)" value={commission} onChangeText={setCommission} keyboardType="numeric" placeholder="VD: 7" />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text }}>Hiện trên trang bio</Text>
          <Switch value={isPublic} onValueChange={setIsPublic} />
        </Row>
      </Card>

      <ErrorText message={error} />
      <Button title="Lưu sản phẩm" onPress={save} loading={busy} />
    </Screen>
  );
}
