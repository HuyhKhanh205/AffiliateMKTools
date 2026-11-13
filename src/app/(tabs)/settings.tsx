import { Link } from 'expo-router';
import { useState } from 'react';
import { Platform, Text } from 'react-native';

import { Button, Card, CopyButton, ErrorText, Field, H1, H2, Muted, Row, Screen, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { unwrap, useFocusedQuery } from '@/lib/data';
import { AI_PRICE_PER_MTOK } from '@/lib/stats';
import { SITE_URL, supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

export default function Settings() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { data: profile, refresh } = useFocusedQuery(
    async () => unwrap(await supabase.from('profiles').select('*').eq('id', userId).single()) as Profile,
    userId,
  );

  const origin = SITE_URL || (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '');
  const bioUrl = profile?.handle ? `${origin}/u/${profile.handle}` : null;

  return (
    <Screen>
      <H1>Cài đặt</H1>

      <Card>
        <H2>Trang bio của bạn</H2>
        <Muted>Một trang công khai liệt kê sản phẩm, để đặt vào bio TikTok / Instagram / Facebook. Mỗi lượt bấm đều được đếm.</Muted>
        {bioUrl ? (
          <>
            <Text selectable style={{ color: colors.primary }}>
              {bioUrl}
            </Text>
            <Row>
              <CopyButton text={bioUrl} label="Copy link bio" />
              <Link href={{ pathname: '/u/[handle]', params: { handle: profile!.handle! } }} style={{ color: colors.primary }}>
                Xem trước →
              </Link>
            </Row>
            {!SITE_URL ? <Muted style={{ fontSize: 12 }}>Đặt EXPO_PUBLIC_SITE_URL sau khi deploy web để link luôn đúng.</Muted> : null}
          </>
        ) : (
          <Muted>Đặt handle bên dưới để có trang bio.</Muted>
        )}
        {/* Re-mount the form when the saved profile changes so its fields start from the stored values. */}
        {profile ? (
          <ProfileForm key={`${profile.handle}|${profile.display_name}|${profile.bio}`} profile={profile} onSaved={refresh} />
        ) : null}
      </Card>

      <Card>
        <H2>Chi phí</H2>
        <Muted>
          • Supabase gói Free: 0đ (project bị tạm dừng nếu 7 ngày không ai truy cập).{'\n'}• AI: Claude Haiku 5.5, ${AI_PRICE_PER_MTOK.input}
          /${AI_PRICE_PER_MTOK.output} mỗi 1 triệu token vào/ra — khoảng 0,0005$ một caption. Giới hạn mặc định 50 lần/ngày.{'\n'}• Web + trang
          bio: Cloudflare Pages / Netlify gói free.
        </Muted>
      </Card>

      <Card>
        <Muted>Đăng nhập: {session?.user.email}</Muted>
        <Button variant="secondary" title="Đăng xuất" onPress={() => supabase.auth.signOut()} />
      </Card>
    </Screen>
  );
}

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [handle, setHandle] = useState(profile.handle ?? '');
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaved(false);
    const h = handle.trim().toLowerCase();
    if (h && !/^[a-z0-9_.-]{3,30}$/.test(h)) return setError('Handle 3-30 ký tự: chữ thường, số, dấu . _ -');
    const { error: e } = await supabase
      .from('profiles')
      .update({ handle: h || null, display_name: displayName.trim() || null, bio: bio.trim() || null })
      .eq('id', profile.id);
    if (e) return setError(e.code === '23505' ? 'Handle này đã có người dùng.' : e.message);
    setError(null);
    setSaved(true);
    onSaved();
  }

  return (
    <>
      <Field label="Handle" value={handle} onChangeText={setHandle} autoCapitalize="none" placeholder="vd: khanh.review" />
      <Field label="Tên hiển thị" value={displayName} onChangeText={setDisplayName} />
      <Field label="Giới thiệu" value={bio} onChangeText={setBio} multiline placeholder="Review đồ công nghệ giá rẻ 💸" />
      <ErrorText message={error} />
      {saved ? <Text style={{ color: colors.success }}>Đã lưu ✓</Text> : null}
      <Button title="Lưu" onPress={save} />
    </>
  );
}
