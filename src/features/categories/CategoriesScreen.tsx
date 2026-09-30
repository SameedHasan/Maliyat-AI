import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Badge,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListItem,
  LoadingState,
  Screen,
  SegmentedControl,
  Surface,
  Text,
  Toggle,
  type IconName,
} from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import type { Category } from '@/domain/types';
import { errorMessage } from '@/features/shared/errors';
import { makeStyles, useTheme } from '@/theme';

import { categoryColor } from './appearance';
import { moveSibling } from './reorder';

type EditableKind = 'expense' | 'income';

export function CategoriesScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const repos = useRepositories();
  const [kind, setKind] = useState<EditableKind>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const load = useCallback(
    (r: Repositories) => r.categories.tree(kind, { includeArchived: showArchived }),
    [kind, showArchived],
  );
  const query = useLiveQuery(load);

  const move = (siblings: readonly Category[], id: string, direction: -1 | 1) => {
    const order = moveSibling(
      siblings.map((c) => c.id),
      id,
      direction,
    );
    if (!order) return;
    try {
      repos.categories.reorder(order);
    } catch (error) {
      Alert.alert(t('states.errorTitle'), errorMessage(t, error));
    }
  };

  const addButton = (
    <IconButton
      icon="add"
      accessibilityLabel={t('categories.add')}
      onPress={() => router.push({ pathname: '/categories/new', params: { kind } })}
    />
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: t('categories.title'), headerRight: () => addButton }} />
      <View style={styles.controls}>
        <SegmentedControl
          accessibilityLabel={t('categories.kind')}
          options={[
            { value: 'expense', label: t('categories.expense') },
            { value: 'income', label: t('categories.income') },
          ]}
          value={kind}
          onChange={setKind}
        />
        <View style={styles.toggleRow}>
          <Text variant="bodySmall" color="textSecondary">
            {t('categories.showArchived')}
          </Text>
          <Toggle
            value={showArchived}
            onValueChange={setShowArchived}
            accessibilityLabel={t('categories.showArchived')}
          />
        </View>
      </View>
      {query.status === 'loading' ? (
        <LoadingState />
      ) : query.status === 'error' ? (
        <ErrorState onRetry={query.reload} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title={t('categories.emptyTitle')}
          action={{
            label: t('categories.add'),
            onPress: () => router.push({ pathname: '/categories/new', params: { kind } }),
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {query.data.map((parent, index) => (
            <Surface key={parent.id} style={styles.group}>
              <CategoryRow
                category={parent}
                colorIndex={index}
                onMoveUp={index > 0 ? () => move(query.data, parent.id, -1) : undefined}
                onMoveDown={
                  index < query.data.length - 1 ? () => move(query.data, parent.id, 1) : undefined
                }
              />
              {parent.children.map((child, childIndex) => (
                <View key={child.id} style={styles.child}>
                  <CategoryRow
                    category={child}
                    colorIndex={index}
                    onMoveUp={
                      childIndex > 0 ? () => move(parent.children, child.id, -1) : undefined
                    }
                    onMoveDown={
                      childIndex < parent.children.length - 1
                        ? () => move(parent.children, child.id, 1)
                        : undefined
                    }
                  />
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('categories.addSubcategoryTo', { name: parent.name })}
                onPress={() =>
                  router.push({
                    pathname: '/categories/new',
                    params: { kind, parentId: parent.id },
                  })
                }
                style={styles.addChild}>
                <Icon name="add" size="sm" color="primary" />
                <Text variant="bodySmall" color="primary">
                  {t('categories.addSubcategory')}
                </Text>
              </Pressable>
            </Surface>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

function CategoryRow({
  category,
  colorIndex,
  onMoveUp,
  onMoveDown,
}: {
  category: Category;
  colorIndex: number;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.swatch,
          { backgroundColor: categoryColor(theme, category.color, colorIndex) },
        ]}
      />
      <View style={styles.rowBody}>
        <ListItem
          icon={(category.icon ?? 'pricetag-outline') as IconName}
          title={category.name}
          accessibilityHint={t('categories.editHint')}
          onPress={() => router.push({ pathname: '/categories/[id]', params: { id: category.id } })}
          trailing={category.isArchived ? <Badge label={t('categories.archived')} /> : null}
        />
      </View>
      <IconButton
        icon="chevron-up"
        accessibilityLabel={t('categories.moveUp', { name: category.name })}
        onPress={() => onMoveUp?.()}
        disabled={!onMoveUp}
      />
      <IconButton
        icon="chevron-down"
        accessibilityLabel={t('categories.moveDown', { name: category.name })}
        onPress={() => onMoveDown?.()}
        disabled={!onMoveDown}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  controls: { padding: t.spacing[4], gap: t.spacing[3] },
  list: { paddingBottom: t.spacing[8] },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  group: { marginHorizontal: t.spacing[4], marginBottom: t.spacing[3] },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.colors.surface },
  rowBody: { flex: 1 },
  swatch: { width: t.spacing[1], alignSelf: 'stretch' },
  child: { paddingStart: t.spacing[6], backgroundColor: t.colors.surface },
  addChild: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[1],
    minHeight: t.touchTarget,
    paddingStart: t.spacing[6] + t.spacing[4],
  },
}));
