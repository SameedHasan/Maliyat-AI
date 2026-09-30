import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  BottomSheet,
  Divider,
  Icon,
  ListItem,
  Screen,
  SectionHeader,
  Surface,
  Text,
  Toggle,
} from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import { toLocalDate } from '@/domain/dates';
import { authenticate } from '@/features/security/deviceAuth';
import { showSnackbar } from '@/store/snackbar';
import {
  LOCK_TIMEOUTS,
  usePreferences,
  type LockTimeout,
  type ThemePreference,
} from '@/store/preferences';
import { makeStyles, useTheme } from '@/theme';

import { DevMenu } from './DevMenu';
import { shareCsv } from './exportCsv';
import { entriesToCsv, exportFileName } from './exportRows';

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

export function MoreScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const themePreference = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  const hideAmounts = usePreferences((s) => s.hideAmounts);
  const toggleHideAmounts = usePreferences((s) => s.toggleHideAmounts);
  const blockScreenshots = usePreferences((s) => s.blockScreenshots);
  const setBlockScreenshots = usePreferences((s) => s.setBlockScreenshots);

  return (
    <Screen scroll>
      <SectionHeader title={t('more.manage')} />
      <Surface style={styles.card}>
        <NavRow icon="pie-chart-outline" title={t('budgets.title')} href="/budgets" />
        <Divider />
        <NavRow icon="pricetags-outline" title={t('categories.title')} href="/categories" />
      </Surface>

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
            <Toggle
              value={hideAmounts}
              onValueChange={toggleHideAmounts}
              accessibilityLabel={t('more.hideAmounts')}
            />
          }
        />
        <Divider />
        <AppLockSettings />
        <Divider />
        <ListItem
          icon="shield-checkmark-outline"
          title={t('more.blockScreenshots')}
          subtitle={t('more.blockScreenshotsHint')}
          trailing={
            <Toggle
              value={blockScreenshots}
              onValueChange={setBlockScreenshots}
              accessibilityLabel={t('more.blockScreenshots')}
            />
          }
        />
      </Surface>

      <SectionHeader title={t('more.data')} />
      <Surface style={styles.card}>
        <ExportRow />
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

function NavRow({
  icon,
  title,
  href,
}: {
  icon: 'pie-chart-outline' | 'pricetags-outline';
  title: string;
  href: '/budgets' | '/categories';
}) {
  return (
    <ListItem
      icon={icon}
      title={title}
      onPress={() => router.push(href)}
      trailing={<Icon name="chevron-forward" color="textMuted" />}
    />
  );
}

function AppLockSettings() {
  const { t } = useTranslation();
  const enabled = usePreferences((s) => s.appLockEnabled);
  const setEnabled = usePreferences((s) => s.setAppLockEnabled);
  const timeout = usePreferences((s) => s.lockTimeout);
  const setTimeout = usePreferences((s) => s.setLockTimeout);
  const [busy, setBusy] = useState(false);
  const [timeoutSheet, setTimeoutSheet] = useState(false);

  const toggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      // Both directions need the owner present, so a borrowed phone cannot turn the lock off.
      const result = await authenticate(
        next ? t('lock.enablePrompt') : t('lock.disablePrompt'),
        t('common.cancel'),
      );
      if (result === 'success') setEnabled(next);
      else if (result === 'unavailable') {
        if (next) showSnackbar({ message: t('lock.unavailable') });
        else setEnabled(false);
      }
    } catch {
      showSnackbar({ message: t('lock.failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ListItem
        icon="lock-closed-outline"
        title={t('more.appLock')}
        subtitle={t('more.appLockHint')}
        trailing={
          <Toggle
            value={enabled}
            disabled={busy}
            onValueChange={(next) => void toggle(next)}
            accessibilityLabel={t('more.appLock')}
          />
        }
      />
      {enabled ? (
        <>
          <Divider />
          <ListItem
            icon="timer-outline"
            title={t('more.lockAfter')}
            subtitle={t(`more.lockTimeouts.${timeout}`)}
            onPress={() => setTimeoutSheet(true)}
            trailing={<Icon name="chevron-forward" color="textMuted" />}
          />
        </>
      ) : null}
      <BottomSheet
        visible={timeoutSheet}
        onClose={() => setTimeoutSheet(false)}
        title={t('more.lockAfter')}>
        {LOCK_TIMEOUTS.map((option: LockTimeout, index) => {
          const label = t(`more.lockTimeouts.${option}`);
          return (
            <View key={option}>
              {index > 0 ? <Divider /> : null}
              <ListItem
                title={label}
                accessibilityLabel={`${t('more.lockAfter')}: ${label}`}
                onPress={() => {
                  setTimeout(option);
                  setTimeoutSheet(false);
                }}
                trailing={option === timeout ? <Icon name="checkmark" color="primary" /> : null}
              />
            </View>
          );
        })}
      </BottomSheet>
    </>
  );
}

function ExportRow() {
  const { t } = useTranslation();
  const theme = useTheme();
  const repos = useRepositories();
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = repos.transactions.exportEntries();
      if (rows.length === 0) {
        showSnackbar({ message: t('more.exportEmpty') });
        return;
      }
      const today = toLocalDate(repos.ctx.now(), repos.ctx.timeZone);
      await shareCsv(entriesToCsv(rows), exportFileName(today), t('more.exportDialogTitle'));
    } catch {
      showSnackbar({ message: t('more.exportFailed') });
    } finally {
      setExporting(false);
    }
  };

  return (
    <ListItem
      icon="download-outline"
      title={t('more.exportCsv')}
      subtitle={t('more.exportCsvHint')}
      onPress={() => void exportCsv()}
      trailing={
        exporting ? (
          <ActivityIndicator
            color={theme.colors.primary}
            accessibilityLabel={t('common.loading')}
          />
        ) : (
          <Icon name="share-outline" color="textMuted" />
        )
      }
    />
  );
}

const useStyles = makeStyles((t) => ({
  card: { marginHorizontal: t.spacing[4] },
  about: { paddingHorizontal: t.spacing[4] },
}));
