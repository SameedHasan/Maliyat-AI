import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, SectionHeader, Surface, Text } from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import { clearDatabase, seedDatabase } from '@/db/seed';
import { makeStyles } from '@/theme';

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; message: string };

/** Only rendered in development builds (`__DEV__`). */
export function DevMenu() {
  const { t } = useTranslation();
  const styles = useStyles();
  const repos = useRepositories();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const confirm = (onConfirm: () => void) =>
    Alert.alert(t('dev.confirmTitle'), t('dev.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('dev.confirm'), style: 'destructive', onPress: onConfirm },
    ]);

  // Seeding is synchronous; yield a frame first so the busy state is visible.
  const run = (task: () => string) => {
    setStatus({ kind: 'busy' });
    setTimeout(() => {
      try {
        setStatus({ kind: 'done', message: task() });
      } catch (error) {
        setStatus({
          kind: 'done',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }, 16);
  };

  const busy = status.kind === 'busy';
  return (
    <>
      <SectionHeader title={t('dev.title')} />
      <Surface padded style={styles.card}>
        <View style={styles.group}>
          <Button
            label={busy ? t('dev.seeding') : t('dev.seed')}
            icon="flask-outline"
            loading={busy}
            accessibilityHint={t('dev.seedHint')}
            onPress={() =>
              confirm(() =>
                run(() => {
                  const result = seedDatabase(repos);
                  return t('dev.seeded', {
                    count: result.transactions,
                    accounts: result.accounts,
                  });
                }),
              )
            }
          />
          <Text variant="caption" color="textMuted">
            {t('dev.seedHint')}
          </Text>
        </View>
        <View style={styles.group}>
          <Button
            label={t('dev.clear')}
            variant="danger"
            icon="trash-outline"
            disabled={busy}
            accessibilityHint={t('dev.clearHint')}
            onPress={() =>
              confirm(() =>
                run(() => {
                  clearDatabase(repos);
                  return t('dev.cleared');
                }),
              )
            }
          />
          <Text variant="caption" color="textMuted">
            {t('dev.clearHint')}
          </Text>
        </View>
        {status.kind === 'done' ? (
          <Text variant="bodySmall" color="textSecondary" accessibilityLiveRegion="polite">
            {status.message}
          </Text>
        ) : null}
      </Surface>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  card: { marginHorizontal: t.spacing[4], gap: t.spacing[4] },
  group: { gap: t.spacing[2] },
}));
