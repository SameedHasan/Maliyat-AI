import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { usePreferences } from '@/store/preferences';
import { makeStyles } from '@/theme';

import { authenticate, isAuthenticating } from './deviceAuth';
import { shouldRelock } from './lock';

/**
 * Covers the app until the user authenticates. Children stay mounted underneath so
 * navigation and form state survive a relock.
 */
export function AppLockGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const enabled = usePreferences((s) => s.appLockEnabled);
  const timeout = usePreferences((s) => s.lockTimeout);
  const setEnabled = usePreferences((s) => s.setAppLockEnabled);
  const [locked, setLocked] = useState(enabled);
  const [failed, setFailed] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const isLocked = enabled && locked;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (isAuthenticating()) return;
        backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (enabled && since !== null && shouldRelock(since, Date.now(), timeout)) {
          setLocked(true);
        }
      }
    });
    return () => subscription.remove();
  }, [enabled, timeout]);

  const unlock = useCallback(() => {
    if (isAuthenticating()) return;
    authenticate(t('lock.prompt'), t('common.cancel')).then(
      (result) => {
        if (result === 'failed') {
          setFailed(true);
          return;
        }
        // 'unavailable' means the screen lock was removed from the device; keeping the
        // gate would lock the user out of their own data.
        if (result === 'unavailable') setEnabled(false);
        setFailed(false);
        setLocked(false);
      },
      () => setFailed(true),
    );
  }, [t, setEnabled]);

  useEffect(() => {
    if (isLocked && AppState.currentState === 'active') unlock();
  }, [isLocked, unlock]);

  return (
    <View style={styles.root}>
      <View
        style={styles.root}
        importantForAccessibility={isLocked ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {isLocked ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.overlay,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
          accessibilityViewIsModal>
          <Icon name="lock-closed" size="xxl" color="primary" />
          <Text variant="title" align="center" accessibilityRole="header">
            {t('lock.title')}
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            {failed ? t('lock.failed') : t('lock.body')}
          </Text>
          <View style={styles.action}>
            <Button label={t('lock.unlock')} icon="finger-print" onPress={unlock} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1 },
  overlay: {
    backgroundColor: t.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing[3],
    paddingHorizontal: t.spacing[6],
  },
  action: { alignSelf: 'stretch', paddingTop: t.spacing[4] },
}));
