import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';

import { Button, Card, Chip, CopyButton, ErrorText, Field, H1, H2, Muted, PlatformBadge, Row, Screen, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { parseNumber } from '@/lib/csv';
import { unwrap, useFocusedQuery } from '@/lib/data';
import { pickAndUploadProductImage } from '@/lib/images';
import { PLATFORM_LABELS, detectPlatform, normalizeUrl } from '@/lib/platform';
import { PROVIDER_LABELS, threadsLength, titleFromUrl } from '@/lib/social';
import { invokeFunction, supabase } from '@/lib/supabase';
import { PLATFORMS, Platform, Post, SocialAccount } from '@/lib/types';

type AutoProvider = 'threads' | 'instagram';
type Drafts = Record<'threads' | 'instagram' | 'tiktok', string>;
interface Result {
  ok: boolean;
  message: string;
  permalink?: string | null;
}

interface LookupResponse {
  title?: string;
  image_url?: string;
  price?: number;
  affiliate_url?: string;
}

export default function PostScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { data, refresh } = useFocusedQuery(async () => {
    const [accounts, posts] = await Promise.all([
      supabase.from('social_accounts').select('*'),
      supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    return { accounts: unwrap(accounts) as SocialAccount[], posts: unwrap(posts) as Post[] };
  }, userId);
  const connected = new Map((data?.accounts ?? []).map((a) => [a.provider, a]));

  // Step 1: product
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [uploading, setUploading] = useState(false);
  const lookupFor = useRef('');

  // Step 2-3: drafts and publishing
  const [productId, setProductId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<AutoProvider, boolean>>({ threads: true, instagram: true });
  const [results, setResults] = useState<Partial<Record<AutoProvider, Result>>>({});
  const [busy, setBusy] = useState<'compose' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read the pasted link once it looks valid: platform, guessed name, preview image.
  useEffect(() => {
    const normalized = normalizeUrl(url);
    const detected = normalized ? detectPlatform(normalized) : null;
    if (!normalized || !detected || lookupFor.current === normalized) return;
    const timer = setTimeout(async () => {
      lookupFor.current = normalized;
      setPlatform(detected);
      setTitle((t) => t || titleFromUrl(normalized) || '');
      setLookupState('loading');
      try {
        const res = await invokeFunction<LookupResponse>('product-lookup', { url: normalized, platform: detected });
        if (res.title) setTitle((t) => (t && t !== titleFromUrl(normalized) ? t : res.title!));
        if (res.image_url) setImageUrl((img) => img ?? res.image_url!);
        if (res.price) setPrice((p) => p || String(res.price));
      } catch {
        // lookup is best-effort; the user can type the name
      } finally {
        setLookupState('done');
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [url]);

  function reset() {
    setUrl('');
    setPlatform(null);
    setTitle('');
    setPrice('');
    setNotes('');
    setImageUrl(null);
    setLookupState('idle');
    lookupFor.current = '';
    setProductId(null);
    setDrafts(null);
    setSource(null);
    setResults({});
    setError(null);
  }

  async function chooseImage() {
    setError(null);
    setUploading(true);
    try {
      const uploaded = await pickAndUploadProductImage(userId);
      if (uploaded) setImageUrl(uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function compose() {
    setError(null);
    const link = normalizeUrl(url);
    if (!link) return setError('Dán link sản phẩm (link affiliate) trước.');
    if (!platform) return setError('Chọn sàn của sản phẩm.');
    if (!title.trim()) return setError('Nhập tên sản phẩm.');
    setBusy('compose');
    try {
      let id = productId;
      const fields = { platform, title: title.trim(), original_url: link, affiliate_url: link, image_url: imageUrl };
      if (id) {
        const { error: e } = await supabase.from('products').update(fields).eq('id', id);
        if (e) throw new Error(e.message);
      } else {
        const { data: created, error: e } = await supabase.from('products').insert(fields).select('id').single();
        if (e || !created) throw new Error(e?.message ?? 'Không lưu được sản phẩm.');
        id = created.id;
        setProductId(id);
      }
      if (price) await supabase.from('price_history').insert({ product_id: id, price: parseNumber(price) });

      const res = await invokeFunction<{ drafts: Drafts; source: string; aiNote: string | null }>('compose-post', {
        product_id: id,
        notes: notes.trim() || undefined,
      });
      setDrafts(res.drafts);
      setSource(res.aiNote ?? (res.source === 'ai' ? 'Viết bằng AI' : 'Viết từ mẫu có sẵn (miễn phí)'));
      setResults({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const canPost = (p: AutoProvider) => connected.has(p) && (p !== 'instagram' || Boolean(imageUrl));
  const targets = (['threads', 'instagram'] as AutoProvider[]).filter((p) => selected[p] && canPost(p) && !results[p]?.ok);

  async function publishAll() {
    if (!drafts) return;
    setBusy('publish');
    for (const provider of targets) {
      try {
        const res = await invokeFunction<{ permalink: string | null }>('publish', {
          provider,
          text: drafts[provider],
          image_url: imageUrl,
          product_id: productId,
        });
        setResults((r) => ({ ...r, [provider]: { ok: true, message: 'Đã đăng ✓', permalink: res.permalink } }));
      } catch (e) {
        setResults((r) => ({ ...r, [provider]: { ok: false, message: e instanceof Error ? e.message : String(e) } }));
      }
    }
    setBusy(null);
    refresh();
  }

  const noConnections = data && data.accounts.length === 0;

  return (
    <Screen>
      <H1>Đăng bài</H1>
      <Muted>Dán link sản phẩm → app viết bài → bấm Đăng. Thế thôi.</Muted>

      {noConnections ? (
        <Card style={{ backgroundColor: colors.primarySoft }}>
          <Text>
            Chưa kết nối Threads / Instagram nên chưa đăng tự động được. Bạn vẫn tạo bài và copy để tự đăng.{' '}
            <Link href="/settings" style={{ color: colors.primary, fontWeight: '700' }}>
              Kết nối ngay →
            </Link>
          </Text>
        </Card>
      ) : null}

      <Card>
        <H2>1. Sản phẩm</H2>
        <Field
          label="Link sản phẩm"
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            if (!t) reset();
          }}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="Dán link affiliate Shopee / Lazada / Tiki / TikTok"
          hint="Trong app Shopee/Lazada/TikTok: mở sản phẩm → Chia sẻ → Lấy link (link affiliate) → dán vào đây."
        />
        {platform ? (
          <Row>
            <PlatformBadge platform={platform} />
            <Muted style={{ fontSize: 12 }}>{lookupState === 'loading' ? 'Đang đọc link…' : 'Đã nhận link ✓'}</Muted>
          </Row>
        ) : url ? (
          <Row style={{ flexWrap: 'wrap' }}>
            {PLATFORMS.map((p) => (
              <Chip key={p} label={PLATFORM_LABELS[p]} active={platform === p} onPress={() => setPlatform(p)} />
            ))}
          </Row>
        ) : null}
        <Field label="Tên sản phẩm" value={title} onChangeText={setTitle} placeholder="VD: Tai nghe Bluetooth chống ồn" />
        <Field label="Giá (tuỳ chọn)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="VD: 349000" />
        <Row style={{ alignItems: 'center' }}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: colors.bg }} contentFit="cover" />
          ) : null}
          <View style={{ flex: 1, gap: 4 }}>
            <Button small variant="secondary" title={imageUrl ? '📷 Đổi ảnh' : '📷 Chọn ảnh sản phẩm'} onPress={chooseImage} loading={uploading} />
            <Muted style={{ fontSize: 12 }}>Instagram bắt buộc có ảnh. Ảnh chụp thật thường được tương tác tốt hơn.</Muted>
          </View>
        </Row>
        <Field
          label="Điểm nổi bật (tuỳ chọn)"
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="VD: pin trâu, đeo cả ngày không đau tai, đang có voucher..."
        />
        <Button title={drafts ? '✨ Viết lại bài' : '✨ Tạo bài viết'} onPress={compose} loading={busy === 'compose'} />
      </Card>

      <ErrorText message={error} />

      {drafts ? (
        <Card>
          <H2>2. Bài viết</H2>
          {source ? <Muted style={{ fontSize: 12 }}>{source}. Bạn có thể sửa trước khi đăng.</Muted> : null}

          {(['threads', 'instagram'] as AutoProvider[]).map((p) => {
            const account = connected.get(p);
            const result = results[p];
            const length = p === 'threads' ? threadsLength(drafts.threads) : drafts.instagram.length;
            const limit = p === 'threads' ? 500 : 2200;
            return (
              <View key={p} style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700' }}>
                    {PROVIDER_LABELS[p]} {account?.username ? <Text style={{ color: colors.muted }}>@{account.username}</Text> : null}
                  </Text>
                  {canPost(p) ? (
                    <Switch value={selected[p]} onValueChange={(v) => setSelected((s) => ({ ...s, [p]: v }))} />
                  ) : (
                    <Link href="/settings" style={{ color: colors.primary, fontSize: 13 }}>
                      {account ? 'Cần ảnh để đăng' : 'Chưa kết nối →'}
                    </Link>
                  )}
                </Row>
                <Field
                  label={`Nội dung (${length}/${limit})`}
                  value={drafts[p]}
                  onChangeText={(t) => setDrafts((d) => (d ? { ...d, [p]: t } : d))}
                  multiline
                  style={{ minHeight: p === 'threads' ? 230 : 260 }}
                />
                <Row style={{ justifyContent: 'space-between' }}>
                  <CopyButton text={drafts[p]} />
                  {result ? (
                    <Text style={{ color: result.ok ? colors.success : colors.danger, flex: 1, textAlign: 'right' }}>
                      {result.message}
                      {result.permalink ? (
                        <Text style={{ color: colors.primary }} onPress={() => Linking.openURL(result.permalink!)}>
                          {'  '}Xem bài ↗
                        </Text>
                      ) : null}
                    </Text>
                  ) : null}
                </Row>
              </View>
            );
          })}

          <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
            <Text style={{ fontWeight: '700' }}>TikTok (copy để tự đăng)</Text>
            <Field
              label="Caption"
              value={drafts.tiktok}
              onChangeText={(t) => setDrafts((d) => (d ? { ...d, tiktok: t } : d))}
              multiline
              style={{ minHeight: 150 }}
            />
            <Row>
              <CopyButton text={drafts.tiktok} />
              <Muted style={{ fontSize: 12, flex: 1 }}>Đăng tự động lên TikTok sẽ có ở bản sau.</Muted>
            </Row>
          </View>
        </Card>
      ) : null}

      {drafts ? (
        <Card>
          <H2>3. Đăng</H2>
          <Button
            title={targets.length ? `🚀 Đăng lên ${targets.map((p) => PROVIDER_LABELS[p]).join(' + ')}` : 'Chọn kênh đã kết nối để đăng'}
            onPress={publishAll}
            loading={busy === 'publish'}
            disabled={targets.length === 0}
          />
          <Button variant="secondary" title="+ Đăng sản phẩm khác" onPress={reset} />
        </Card>
      ) : null}

      {data?.posts.length ? (
        <Card>
          <H2>Bài đã đăng gần đây</H2>
          {data.posts.map((p) => (
            <Row key={p.id} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1}>{p.text.split('\n')[0]}</Text>
                <Muted style={{ fontSize: 12 }}>
                  {PROVIDER_LABELS[p.provider]} · {new Date(p.created_at).toLocaleString('vi-VN')}
                  {p.error ? ` · ${p.error}` : ''}
                </Muted>
              </View>
              {p.permalink ? (
                <Text style={{ color: colors.primary }} onPress={() => Linking.openURL(p.permalink!)}>
                  Xem ↗
                </Text>
              ) : (
                <Text style={{ color: p.status === 'failed' ? colors.danger : colors.muted }}>
                  {p.status === 'failed' ? 'Lỗi' : p.status === 'published' ? 'Đã đăng' : 'Đang đăng'}
                </Text>
              )}
            </Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
