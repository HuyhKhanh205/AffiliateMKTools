import * as Clipboard from 'expo-clipboard';
import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PLATFORM_COLORS, PLATFORM_LABELS } from '@/lib/platform';
import { Platform } from '@/lib/types';

export const colors = {
  bg: '#F5F6FA',
  card: '#FFFFFF',
  text: '#1B1D29',
  muted: '#6B7083',
  border: '#E3E5EE',
  primary: '#EE4D2D',
  primarySoft: '#FDEBE7',
  success: '#12A150',
  warning: '#D97706',
  danger: '#DC2626',
};

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
        >
          <View style={styles.inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.inner, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (pressed || isDisabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.buttonText, variant === 'secondary' && { color: colors.primary }, small && { fontSize: 13 }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  containerStyle,
  ...props
}: TextInputProps & { label: string; hint?: string; containerStyle?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 4 }, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && styles.inputMultiline, props.style]} />
      {hint ? <Muted style={{ fontSize: 12 }}>{hint}</Muted> : null}
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <View style={[styles.badge, { backgroundColor: PLATFORM_COLORS[platform] }]}>
      <Text style={styles.badgeText}>{PLATFORM_LABELS[platform]}</Text>
    </View>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

/** Vertical bar chart drawn with plain Views (no chart library needed). */
export function BarChart({ data, height = 110 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View>
      <View style={[styles.chart, { height }]}>
        {data.map((d, i) => (
          <View key={i} style={styles.barSlot} accessibilityLabel={`${d.label}: ${d.value}`}>
            {d.value > 0 ? <Text style={styles.barValue}>{d.value}</Text> : null}
            <View style={[styles.bar, { height: Math.max(2, (d.value / max) * (height - 18)) }]} />
          </View>
        ))}
      </View>
      <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <Muted style={{ fontSize: 11 }}>{data[0]?.label}</Muted>
        <Muted style={{ fontSize: 11 }}>{data[data.length - 1]?.label}</Muted>
      </Row>
    </View>
  );
}

/** Horizontal share bars, e.g. clicks by platform/channel. */
export function ShareBars({ items }: { items: { label: string; value: number; color?: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <View style={{ gap: 8 }}>
      {items.map((i) => (
        <View key={i.label} style={{ gap: 3 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text }}>{i.label}</Text>
            <Muted>
              {i.value} ({Math.round((i.value / total) * 100)}%)
            </Muted>
          </Row>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(i.value / total) * 100}%`, backgroundColor: i.color ?? colors.primary }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      small
      variant="secondary"
      title={copied ? 'Đã copy ✓' : label}
      onPress={async () => {
        await Clipboard.setStringAsync(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    />
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </Card>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={{ color: colors.danger }}>{message}</Text>;
}

export function Loading() {
  return (
    <View style={{ padding: 32, alignItems: 'center' }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 14 },
  h1: { fontSize: 24, fontWeight: '700', color: colors.text },
  h2: { fontSize: 17, fontWeight: '600', color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { paddingVertical: 7, paddingHorizontal: 12 },
  buttonSecondary: { backgroundColor: colors.primarySoft },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statLabel: { color: colors.muted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 2 },
  statSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  barValue: { fontSize: 9, color: colors.muted, marginBottom: 2 },
  track: { height: 8, backgroundColor: colors.bg, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
