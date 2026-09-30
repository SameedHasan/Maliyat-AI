import Constants from 'expo-constants';
import { Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Divider, Icon, ListItem, Screen, SectionHeader, Surface, Text } from '@/components/ui';
import { usePreferences, type ThemePreference } from '@/store/preferences';
import { makeStyles, useTheme } from '@/theme';

import { DevMenu } from './DevMenu';

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

export function MoreScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const themePreference = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  const hideAmounts = usePreferences((s) => s.hideAmounts);
  const toggleHideAmounts = usePreferences((s) => s.toggleHideAmounts);

  return (
    <Screen scroll>
      <SectionHeader title={t('more.appearance')} />
      <Surface style={styles.card}>
        {THEME_OPTIONS.map((option, index) => {
          const selected = option === themePreference;
          const label = t(`more.themeOptions.${option}`);
          return (
            <View key={option}>
              {index > 0 ? <Divider /> : null}
              <ListItem
                title={label}
                accessibilityLabel={`${t('more.theme')}: ${label}`}
                onPress={() => setTheme(option)}
                trailing={selected ? <Icon name="checkmark" color="primary" /> : null}
              />
            </View>
          );
        })}
      </Surface>

      <SectionHeader title={t('more.privacy')} />
      <Surface style={styles.card}>
        <ListItem
          icon="eye-off-outline"
          title={t('more.hideAmounts')}
          subtitle={t('more.hideAmountsHint')}
          trailing={
            <Switch
              value={hideAmounts}
              onValueChange={toggleHideAmounts}
              accessibilityLabel={t('more.hideAmounts')}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
            />
          }
        />
      </Surface>

      {__DEV__ ? <DevMenu /> : null}

      <SectionHeader title={t('more.about')} />
      <View style={styles.about}>
        <Text variant="bodySmall" color="textMuted">
          {t('more.version', { version: Constants.expoConfig?.version ?? '—' })}
        </Text>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  card: { marginHorizontal: t.spacing[4] },
  about: { paddingHorizontal: t.spacing[4] },
}));
