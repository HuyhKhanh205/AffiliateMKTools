import { Link } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { BarChart, Card, Empty, ErrorText, H1, H2, Muted, Row, Screen, ShareBars, StatTile, colors } from '@/components/ui';
import { unwrap, useFocusedQuery } from '@/lib/data';
import { CHANNEL_LABELS } from '@/lib/links';
import { PLATFORM_COLORS, PLATFORM_LABELS, formatVnd } from '@/lib/platform';
import { earningsPerClick, estimateAiCostUsd, lastDays, summarizeClicks, summarizeEarnings } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { Channel, Conversion, DailyClickRow, Platform, Product } from '@/lib/types';

async function loadDashboard() {
  const now = new Date();
  const since = lastDays(now, 30)[0];
  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [clicks, products, conversions, ai] = await Promise.all([
    supabase.from('daily_clicks').select('*').gte('day', since),
    supabase.from('products').select('id, title, platform, is_deal'),
    supabase.from('conversions').select('*').gte('order_date', since),
    supabase.from('ai_generations').select('input_tokens, output_tokens').gte('created_at', sinceIso),
  ]);
  const aiRows = unwrap(ai) as { input_tokens: number; output_tokens: number }[];
  return {
    clicks: summarizeClicks(unwrap(clicks) as DailyClickRow[], now),
    products: unwrap(products) as Pick<Product, 'id' | 'title' | 'platform' | 'is_deal'>[],
    earnings: summarizeEarnings(unwrap(conversions) as Conversion[]),
    aiCount: aiRows.length,
    aiCost: aiRows.reduce((s, r) => s + estimateAiCostUsd(r.input_tokens, r.output_tokens), 0),
  };
}

export default function Dashboard() {
  const { data, error, loading, refresh } = useFocusedQuery(loadDashboard);

  const commission30 = data ? data.earnings.approved + data.earnings.pending : 0;
  const epc = data ? earningsPerClick(commission30, data.clicks.last30) : null;
  const productById = new Map((data?.products ?? []).map((p) => [p.id, p]));
  const deals = data?.products.filter((p) => p.is_deal).length ?? 0;
  const bestChannel = data
    ? (Object.entries(data.clicks.byChannel) as [Channel, number][]).sort((a, b) => b[1] - a[1])[0]
    : undefined;

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <H1>Thống kê</H1>
      <ErrorText message={error} />

      {data && data.products.length === 0 ? (
        <Empty title="Bắt đầu nào 👋">
          <Muted style={{ textAlign: 'center' }}>Thêm sản phẩm đầu tiên, copy link theo dõi rồi dán vào TikTok/Facebook/bio.</Muted>
          <Link href="/product/new" style={{ color: colors.primary, fontWeight: '600' }}>
            + Thêm sản phẩm
          </Link>
        </Empty>
      ) : null}

      <Row style={{ flexWrap: 'wrap' }}>
        <StatTile label="Click hôm nay" value={String(data?.clicks.today ?? '–')} />
        <StatTile label="Click 7 ngày" value={String(data?.clicks.last7 ?? '–')} />
        <StatTile label="Hoa hồng 30 ngày" value={formatVnd(commission30)} sub={data ? `${data.earnings.orders} đơn` : undefined} />
        <StatTile label="Thu nhập / click" value={epc === null ? '–' : formatVnd(epc)} sub="EPC 30 ngày" />
      </Row>

      <Card>
        <H2>Click 14 ngày qua</H2>
        <BarChart data={(data?.clicks.series ?? []).map((d) => ({ label: d.day.slice(5).split('-').reverse().join('/'), value: d.clicks }))} />
        <Muted>Tổng 30 ngày: {data?.clicks.last30 ?? 0} click</Muted>
      </Card>

      {bestChannel || deals > 0 ? (
        <Card style={{ backgroundColor: colors.primarySoft }}>
          <H2>Gợi ý</H2>
          {bestChannel ? (
            <Text>
              Kênh mang nhiều click nhất là <Text style={{ fontWeight: '700' }}>{CHANNEL_LABELS[bestChannel[0]]}</Text> — ưu tiên đăng
              nội dung ở đây.
            </Text>
          ) : null}
          {deals > 0 ? (
            <Text>
              Có <Text style={{ fontWeight: '700' }}>{deals} sản phẩm đang giảm giá</Text> — đăng ngay khi deal còn hot (tab Deal).
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <H2>Theo sàn</H2>
        {data && Object.keys(data.clicks.byPlatform).length ? (
          <ShareBars
            items={(Object.entries(data.clicks.byPlatform) as [Platform, number][]).map(([p, v]) => ({
              label: PLATFORM_LABELS[p],
              value: v,
              color: PLATFORM_COLORS[p],
            }))}
          />
        ) : (
          <Muted>Chưa có click.</Muted>
        )}
      </Card>

      <Card>
        <H2>Theo kênh</H2>
        {data && Object.keys(data.clicks.byChannel).length ? (
          <ShareBars
            items={(Object.entries(data.clicks.byChannel) as [Channel, number][]).map(([c, v]) => ({ label: CHANNEL_LABELS[c], value: v }))}
          />
        ) : (
          <Muted>Chưa có click.</Muted>
        )}
      </Card>

      <Card>
        <H2>Top sản phẩm (30 ngày)</H2>
        {data?.clicks.topProducts.length ? (
          data.clicks.topProducts.map((t, i) => (
            <Link key={t.productId} href={{ pathname: '/product/[id]', params: { id: t.productId } }} asChild>
              <Pressable>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ flex: 1 }} numberOfLines={1}>
                    {i + 1}. {productById.get(t.productId)?.title ?? 'Sản phẩm đã xoá'}
                  </Text>
                  <Text style={{ fontWeight: '600' }}>{t.clicks} click</Text>
                </Row>
              </Pressable>
            </Link>
          ))
        ) : (
          <Muted>Chưa có dữ liệu.</Muted>
        )}
      </Card>

      <Muted style={{ textAlign: 'center', fontSize: 12 }}>
        AI 30 ngày: {data?.aiCount ?? 0} lần · ước tính ${(data?.aiCost ?? 0).toFixed(4)}
      </Muted>
    </Screen>
  );
}
