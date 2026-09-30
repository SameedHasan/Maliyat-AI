import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, MoneyText, ProgressBar, Text } from '@/components/ui';
import type { BudgetWithStatus } from '@/data/repositories';
import type { BudgetState } from '@/domain/budgets';
import { makeStyles, useTheme } from '@/theme';
import { formatRange } from '@/utils/format';

const TONES: Record<BudgetState, 'primary' | 'warning' | 'danger'> = {
  ok: 'primary',
  warning: 'warning',
  over: 'danger',
};

const BADGE_TONES = { ok: 'success', warning: 'warning', over: 'danger' } as const;

export function BudgetCard({ budget }: { budget: BudgetWithStatus }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { status } = budget;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('budgets.openHint')}
      onPress={() => router.push({ pathname: '/budgets/[id]', params: { id: budget.id } })}
      android_ripple={{ color: theme.colors.divider }}
      style={styles.card}>
      <View style={styles.titleRow}>
        <Text variant="heading" numberOfLines={1} style={styles.title}>
          {budget.name}
        </Text>
        {status ? (
          <Badge label={t(`budgets.states.${status.state}`)} tone={BADGE_TONES[status.state]} />
        ) : (
          <Badge label={t('budgets.inactive')} />
        )}
      </View>
      {status ? (
        <>
          <ProgressBar
            progress={status.percentUsed / 100}
            tone={TONES[status.state]}
            accessibilityLabel={t('budgets.percentUsed', { percent: status.percentUsed })}
          />
          <View style={styles.amounts}>
            <Text variant="bodySmall" color="textSecondary">
              <MoneyText
                amountMinor={status.spentMinor}
                currency={budget.currency}
                variant="bodySmall"
              />
              {' / '}
              <MoneyText
                amountMinor={status.availableMinor}
                currency={budget.currency}
                variant="bodySmall"
              />
            </Text>
            <Text variant="bodySmall" color="textSecondary">
              {status.remainingMinor >= 0 ? t('budgets.left') : t('budgets.over')}{' '}
              <MoneyText
                amountMinor={Math.abs(status.remainingMinor)}
                currency={budget.currency}
                variant="bodySmall"
              />
            </Text>
          </View>
          <Text variant="caption" color="textMuted">
            {formatRange(status.range.start, status.range.end)} · {status.percentUsed}%
          </Text>
        </>
      ) : (
        <Text variant="caption" color="textMuted">
          {t('budgets.notActiveBody')}
        </Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: { padding: t.spacing[4], gap: t.spacing[2], backgroundColor: t.colors.surface },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] },
  title: { flex: 1 },
  amounts: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
}));
