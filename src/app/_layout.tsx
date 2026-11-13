import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';

function RootNavigator() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  const signedIn = Boolean(session);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="product/new" options={{ headerShown: true, title: 'Thêm sản phẩm', presentation: 'modal' }} />
        <Stack.Screen name="product/[id]" options={{ headerShown: true, title: 'Sản phẩm' }} />
      </Stack.Protected>
      {/* Public bio page: always reachable, signed in or not. */}
      <Stack.Screen name="u/[handle]" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}
