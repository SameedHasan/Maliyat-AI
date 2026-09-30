import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  Surface,
} from '@/components/ui';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { makeStyles } from '@/theme';

import { BudgetCard } from './BudgetCard';

function loadBudgets(repos: Repositories) {
  return repos.budgets.listWithStatus();
}

export function BudgetsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const query = useLiveQuery(loadBudgets);
  const add = () => router.push('/budgets/new');

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: t('budgets.title'),
          headerRight: () => (
            <IconButton icon="add" accessibilityLabel={t('budgets.add')} onPress={add} />
          ),
        }}
      />
      {query.status === 'loading' ? (
        <LoadingState />
      ) : query.status === 'error' ? (
        <ErrorState onRetry={query.reload} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon="pie-chart-outline"
          title={t('budgets.emptyTitle')}
          message={t('budgets.emptyBody')}
          action={{ label: t('budgets.add'), onPress: add }}
        />
      ) : (
        <>
          <Surface style={styles.list}>
            {query.data.map((budget, index) => (
              <View key={budget.id}>
                {index > 0 ? <Divider /> : null}
                <BudgetCard budget={budget} />
              </View>
            ))}
          </Surface>
          <View style={styles.footer}>
            <Button label={t('budgets.add')} icon="add" variant="secondary" onPress={add} />
          </View>
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  list: { marginHorizontal: t.spacing[4], marginTop: t.spacing[4] },
  footer: { padding: t.spacing[4] },
}));
