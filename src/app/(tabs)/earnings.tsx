import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, Chip, ErrorText, Field, H1, H2, Muted, Row, Screen, StatTile, colors } from '@/components/ui';
import { conversionsFromCsv, parseDate, parseNumber } from '@/lib/csv';
import { unwrap, useFocusedQuery } from '@/lib/data';
import { PLATFORM_LABELS, formatVnd } from '@/lib/platform';
import { summarizeEarnings, vnDay } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { Conversion, ConversionStatus, PLATFORMS, Platform } from '@/lib/types';

const STATUS_LABELS: Record<ConversionStatus, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị huỷ',
};
const STATUS_COLORS: Record<ConversionStatus, string> = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
};

export default function Earnings() {
  const [range, setRange] = useState<30 | 90 | 365>(30);
  const { data, error, loading, refresh } = useFocusedQuery(async () => {
    const since = vnDay(new Date(Date.now() - range * 24 * 60 * 60 * 1000));
    return unwrap(
      await supabase.from('conversions').select('*').gte('order_date', since).order('order_date', { ascending: false }),
    ) as Conversion[];
  }, String(range));

  const s = summarizeEarnings(data ?? []);

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <H1>Hoa hồng</H1>
      <Row>
        {([30, 90, 365] as const).map((d) => (
          <Chip key={d} label={`${d} ngày`} active={range === d} onPress={() => setRange(d)} />
        ))}
      </Row>
      <ErrorText message={error} />
      <Row style={{ flexWrap: 'wrap' }}>
        <StatTile label="Đã duyệt" value={formatVnd(s.approved)} />
        <StatTile label="Chờ duyệt" value={formatVnd(s.pending)} />
        <StatTile label="Số đơn" value={String(s.orders)} sub={`Doanh số ${formatVnd(s.revenue)}`} />
        <StatTile label="Bị huỷ" value={formatVnd(s.rejected)} />
      </Row>

      <ImportCard onDone={refresh} />
      <ManualCard onDone={refresh} />

      <Card>
        <H2>Đơn gần đây</H2>
        {(data ?? []).slice(0, 50).map((c) => (
          <Row key={c.id} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text>
                {PLATFORM_LABELS[c.platform]} · {c.order_date.split('-').reverse().join('/')}
              </Text>
              <Muted style={{ fontSize: 12 }}>
                {c.external_order_id ?? 'Nhập tay'} · đơn {formatVnd(c.order_amount)}
              </Muted>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontWeight: '700' }}>{formatVnd(c.commission)}</Text>
              <Text style={{ color: STATUS_COLORS[c.status], fontSize: 12 }}>{STATUS_LABELS[c.status]}</Text>
            </View>
          </Row>
        ))}
        {data && data.length === 0 ? <Muted>Chưa có đơn trong khoảng này.</Muted> : null}
      </Card>
    </Screen>
  );
}

function PlatformPicker({ value, onChange }: { value: Platform; onChange: (p: Platform) => void }) {
  return (
    <Row style={{ flexWrap: 'wrap' }}>
      {PLATFORMS.map((p) => (
        <Chip key={p} label={PLATFORM_LABELS[p]} active={value === p} onPress={() => onChange(p)} />
      ))}
    </Row>
  );
}

function ImportCard({ onDone }: { onDone: () => void }) {
  const [platform, setPlatform] = useState<Platform>('shopee');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runImport() {
    setMessage(null);
    setError(null);
    const result = conversionsFromCsv(text, platform);
    if (result.missingColumns.length) {
      return setError(`Không tìm thấy cột: ${result.missingColumns.join(', ')}. Cần có ít nhất cột ngày đặt hàng và hoa hồng.`);
    }
    if (result.conversions.length === 0) return setError('Không có dòng hợp lệ.');
    setBusy(true);
    const withId = result.conversions.filter((c) => c.external_order_id);
    const withoutId = result.conversions.filter((c) => !c.external_order_id);
    // Rows with an order id are upserted, so re-importing a report updates statuses instead of duplicating.
    const r1 = withId.length
      ? await supabase.from('conversions').upsert(withId, { onConflict: 'user_id,platform,external_order_id' })
      : { error: null };
    const r2 = withoutId.length ? await supabase.from('conversions').insert(withoutId) : { error: null };
    setBusy(false);
    const e = r1.error ?? r2.error;
    if (e) return setError(e.message);
    setText('');
    setMessage(`Đã nhập ${result.conversions.length} đơn${result.skipped ? `, bỏ qua ${result.skipped} dòng lỗi ngày` : ''}.`);
    onDone();
  }

  return (
    <Card>
      <H2>Nhập báo cáo CSV</H2>
      <Muted>
        Tải báo cáo hoa hồng từ Shopee Affiliate / AccessTrade / TikTok, mở bằng Excel/Google Sheets, copy toàn bộ (kèm dòng tiêu đề)
        rồi dán vào đây. Nhập lại báo cáo mới sẽ cập nhật trạng thái đơn cũ.
      </Muted>
      <PlatformPicker value={platform} onChange={setPlatform} />
      <Field label="Nội dung CSV" value={text} onChangeText={setText} multiline placeholder="Order ID,Order Time,Purchase Value,Total Commission,..." />
      <ErrorText message={error} />
      {message ? <Text style={{ color: colors.success }}>{message}</Text> : null}
      <Button title="Nhập" onPress={runImport} loading={busy} disabled={!text.trim()} />
    </Card>
  );
}

function ManualCard({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>('tiktok');
  const [date, setDate] = useState(vnDay(new Date()).split('-').reverse().join('/'));
  const [amount, setAmount] = useState('');
  const [commission, setCommission] = useState('');
  const [status, setStatus] = useState<ConversionStatus>('pending');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const orderDate = parseDate(date);
    if (!orderDate || !commission) return setError('Nhập ngày (dd/mm/yyyy) và hoa hồng.');
    const { error: e } = await supabase.from('conversions').insert({
      platform,
      order_date: orderDate,
      order_amount: parseNumber(amount),
      commission: parseNumber(commission),
      status,
      source: 'manual',
    });
    if (e) return setError(e.message);
    setError(null);
    setAmount('');
    setCommission('');
    setOpen(false);
    onDone();
  }

  if (!open) return <Button variant="secondary" title="+ Nhập đơn thủ công" onPress={() => setOpen(true)} />;

  return (
    <Card>
      <H2>Nhập đơn thủ công</H2>
      <PlatformPicker value={platform} onChange={setPlatform} />
      <Field label="Ngày đặt (dd/mm/yyyy)" value={date} onChangeText={setDate} />
      <Row>
        <Field label="Giá trị đơn (đ)" value={amount} onChangeText={setAmount} keyboardType="numeric" containerStyle={{ flex: 1 }} />
        <Field label="Hoa hồng (đ)" value={commission} onChangeText={setCommission} keyboardType="numeric" containerStyle={{ flex: 1 }} />
      </Row>
      <Row>
        {(Object.keys(STATUS_LABELS) as ConversionStatus[]).map((st) => (
          <Chip key={st} label={STATUS_LABELS[st]} active={status === st} onPress={() => setStatus(st)} />
        ))}
      </Row>
      <ErrorText message={error} />
      <Button title="Lưu đơn" onPress={save} />
    </Card>
  );
}
