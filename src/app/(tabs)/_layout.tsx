import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/ui';
import { usePreferences } from '@/store/preferences';
import { useTheme } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(focused: IoniconName, idle: IoniconName) {
  return function TabIcon({
    color,
    size,
    focused: isFocused,
  }: {
    color: ColorValue;
    size: number;
    focused: boolean;
  }) {
    return <Ionicons name={isFocused ? focused : idle} size={size} color={color} />;
  };
}

function HideAmountsToggle() {
  const { t } = useTranslation();
  const hidden = usePreferences((s) => s.hideAmounts);
  const toggle = usePreferences((s) => s.toggleHideAmounts);
  return (
    <IconButton
      icon={hidden ? 'eye-off-outline' : 'eye-outline'}
      accessibilityLabel={hidden ? t('common.showAmounts') : t('common.hideAmounts')}
      onPress={toggle}
    />
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        headerTintColor: theme.colors.text,
        headerTitleStyle: theme.typography.title,
        headerRight: () => <HideAmountsToggle />,
        headerRightContainerStyle: { paddingEnd: theme.spacing[2] },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        sceneStyle: { backgroundColor: theme.colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t('tabs.transactions'),
          tabBarIcon: tabIcon('list', 'list-outline'),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t('tabs.analytics'),
          tabBarIcon: tabIcon('pie-chart', 'pie-chart-outline'),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{ title: t('tabs.accounts'), tabBarIcon: tabIcon('wallet', 'wallet-outline') }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('tabs.more'),
          headerRight: undefined,
          tabBarIcon: tabIcon('ellipsis-horizontal-circle', 'ellipsis-horizontal-circle-outline'),
        }}
      />
    </Tabs>
  );
}
