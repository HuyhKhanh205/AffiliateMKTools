import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Card, ErrorText, Field, H1, Muted, Screen } from '@/components/ui';
import { isConfigured, supabase } from '@/lib/supabase';

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setInfo(null);
    if (!email.includes('@') || password.length < 6) {
      setError('Nhập email hợp lệ và mật khẩu ít nhất 6 ký tự.');
      return;
    }
    setBusy(true);
    const { data, error: authError } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (authError) setError(authError.message);
    else if (mode === 'signup' && !data.session) setInfo('Đã gửi email xác nhận. Mở email, bấm xác nhận rồi đăng nhập.');
  }

  return (
    <Screen>
      <H1>Affiliate Hub</H1>
      <Muted>Quản lý link affiliate Shopee, Lazada, Tiki, TikTok Shop — đếm click, trang bio, viết caption bằng AI, săn deal.</Muted>

      {!isConfigured ? (
        <Card>
          <Text style={{ fontWeight: '600' }}>Chưa cấu hình Supabase</Text>
          <Muted>
            Tạo file .env.local với EXPO_PUBLIC_SUPABASE_URL và EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (xem README), rồi chạy lại
            `npx expo start`.
          </Muted>
        </Card>
      ) : null}

      <Card>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="ban@example.com"
        />
        <Field
          label="Mật khẩu"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="Ít nhất 6 ký tự"
          onSubmitEditing={submit}
        />
        <ErrorText message={error} />
        {info ? <Text style={{ color: '#12A150' }}>{info}</Text> : null}
        <Button title={mode === 'signin' ? 'Đăng nhập' : 'Tạo tài khoản'} onPress={submit} loading={busy} disabled={!isConfigured} />
        <Button
          variant="secondary"
          title={mode === 'signin' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
          onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        />
      </Card>
    </Screen>
  );
}
