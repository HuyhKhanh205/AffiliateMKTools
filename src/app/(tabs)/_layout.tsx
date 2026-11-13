import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { colors } from '@/components/ui';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
  };

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen name="index" options={{ title: 'Tổng quan', tabBarIcon: icon('📊') }} />
      <Tabs.Screen name="products" options={{ title: 'Sản phẩm', tabBarIcon: icon('🛍️') }} />
      <Tabs.Screen name="deals" options={{ title: 'Deal', tabBarIcon: icon('🔥') }} />
      <Tabs.Screen name="earnings" options={{ title: 'Hoa hồng', tabBarIcon: icon('💰') }} />
      <Tabs.Screen name="settings" options={{ title: 'Cài đặt', tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}
