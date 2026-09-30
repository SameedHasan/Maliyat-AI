import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Screen,
  SegmentedControl,
  SelectField,
  Text,
  TextField,
} from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import type { Category } from '@/domain/types';
import { CategoryPicker } from '@/features/shared/CategoryPicker';
import { errorMessage } from '@/features/shared/errors';
import { showSnackbar } from '@/store/snackbar';
import { makeStyles, useTheme } from '@/theme';

import { CATEGORY_COLOR_KEYS, CATEGORY_ICONS, categoryColor } from './appearance';

type EditableKind = 'expense' | 'income';

export interface CategoryFormScreenProps {
  id?: string;
  kind?: EditableKind;
  parentId?: string;
}

function loadCategoryForm(repos: Repositories, id: string | undefined) {
  const category = id ? repos.categories.get(id) : undefined;
  const hasChildren = category
    ? repos.categories.list({ includeArchived: true }).some((c) => c.parentId === category.id)
    : false;
  return {
    category: category ?? null,
    hasChildren,
    usage: category ? repos.categories.usageCount(category.id) : 0,
    trees: {
      expense: repos.categories.tree('expense'),
      income: repos.categories.tree('income'),
    },
  };
}

export function CategoryFormScreen({ id, kind, parentId }: CategoryFormScreenProps) {
  const { t } = useTranslation();
  const load = useCallback((r: Repositories) => loadCategoryForm(r, id), [id]);
  const query = useLiveQuery(load);

  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;
  if (id && !query.data.category) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title={t('errors.not_found')} />
      </Screen>
    );
  }
  return (
    <CategoryForm
      {...query.data}
      initialKind={kind ?? 'expense'}
      initialParentId={parentId ?? null}
    />
  );
}

function CategoryForm({
  category,
  hasChildren,
  usage,
  trees,
  initialKind,
  initialParentId,
}: ReturnType<typeof loadCategoryForm> & {
  initialKind: EditableKind;
  initialParentId: string | null;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const repos = useRepositories();
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<EditableKind>(
    category && category.kind !== 'system' ? category.kind : initialKind,
  );
  const [parentId, setParentId] = useState<string | null>(category?.parentId ?? initialParentId);
  const [icon, setIcon] = useState<string | null>(category?.icon ?? 'pricetag-outline');
  const [color, setColor] = useState<string | null>(category?.color ?? null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [parentSheet, setParentSheet] = useState(false);
  const [replacementSheet, setReplacementSheet] = useState(false);

  const tree = trees[kind];
  const parent = parentId ? tree.find((c) => c.id === parentId) : undefined;

  const save = () => {
    if (name.trim() === '') {
      setNameError(t('errors.form.required'));
      return;
    }
    const input = { name, kind, parentId, icon, color };
    try {
      if (category) repos.categories.update(category.id, input);
      else repos.categories.create(input);
      router.back();
    } catch (error) {
      Alert.alert(t('states.errorTitle'), errorMessage(t, error));
    }
  };

  const toggleArchived = (target: Category) => {
    try {
      repos.categories.setArchived(target.id, !target.isArchived);
      showSnackbar({
        message: target.isArchived ? t('categories.unarchived') : t('categories.archivedDone'),
      });
      router.back();
    } catch (error) {
      Alert.alert(t('states.errorTitle'), errorMessage(t, error));
    }
  };

  const removeWith = (target: Category, replacementId?: string) => {
    try {
      repos.categories.remove(target.id, replacementId);
      showSnackbar({ message: t('categories.deleted') });
      router.back();
    } catch (error) {
      Alert.alert(t('states.errorTitle'), errorMessage(t, error));
    }
  };

  const startDelete = (target: Category) => {
    if (hasChildren) {
      Alert.alert(t('states.errorTitle'), t('errors.category_has_children'));
      return;
    }
    if (usage > 0) {
      setReplacementSheet(true);
      return;
    }
    Alert.alert(t('categories.deleteTitle'), t('categories.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeWith(target) },
    ]);
  };

  return (
    <Screen scroll padded>
      <Stack.Screen
        options={{
          title: category
            ? t('categories.edit')
            : parentId
              ? t('categories.addSubcategory')
              : t('categories.add'),
        }}
      />
      <View style={styles.form}>
        {!category ? (
          <SegmentedControl
            accessibilityLabel={t('categories.kind')}
            options={[
              { value: 'expense', label: t('categories.expense') },
              { value: 'income', label: t('categories.income') },
            ]}
            value={kind}
            onChange={(next) => {
              setKind(next);
              setParentId(null);
            }}
          />
        ) : null}
        <TextField
          label={t('categories.fields.name')}
          value={name}
          onChangeText={(text) => {
            setName(text);
            setNameError(null);
          }}
          autoCapitalize="words"
          maxLength={40}
          error={nameError}
          autoFocus={!category}
        />
        <SelectField
          label={t('categories.fields.parent')}
          value={parent?.name ?? t('categories.noParent')}
          placeholder={t('categories.noParent')}
          icon="git-branch-outline"
          onPress={() => setParentSheet(true)}
          disabled={hasChildren}
        />
        {hasChildren ? (
          <Text variant="caption" color="textMuted">
            {t('categories.parentLocked')}
          </Text>
        ) : null}

        <Text variant="caption" color="textSecondary">
          {t('categories.fields.icon')}
        </Text>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {CATEGORY_ICONS.map((option) => {
            const selected = option === icon;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={option.replace(/-outline$/, '').replace(/-/g, ' ')}
                accessibilityState={{ checked: selected }}
                onPress={() => setIcon(option)}
                style={[styles.iconCell, selected && styles.selectedCell]}>
                <Icon name={option} size="md" color={selected ? 'primary' : 'textSecondary'} />
              </Pressable>
            );
          })}
        </View>

        <Text variant="caption" color="textSecondary">
          {t('categories.fields.color')}
        </Text>
        <View style={styles.grid} accessibilityRole="radiogroup">
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={t('categories.autoColor')}
            accessibilityState={{ checked: color === null }}
            onPress={() => setColor(null)}
            style={[styles.colorCell, color === null && styles.selectedCell]}>
            <Icon name="color-wand-outline" size="md" />
          </Pressable>
          {CATEGORY_COLOR_KEYS.map((key, index) => (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityLabel={t('categories.colorN', { n: index + 1 })}
              accessibilityState={{ checked: color === key }}
              onPress={() => setColor(key)}
              style={[styles.colorCell, color === key && styles.selectedCell]}>
              <View style={[styles.swatch, { backgroundColor: categoryColor(theme, key, 0) }]} />
            </Pressable>
          ))}
        </View>

        <Button label={t('common.save')} icon="checkmark" onPress={save} />
        {category ? (
          <>
            <Button
              label={category.isArchived ? t('categories.unarchive') : t('categories.archive')}
              icon="archive-outline"
              variant="secondary"
              onPress={() => toggleArchived(category)}
            />
            <Button
              label={t('common.delete')}
              icon="trash-outline"
              variant="danger"
              onPress={() => startDelete(category)}
            />
            {usage > 0 ? (
              <Text variant="caption" color="textMuted">
                {t('categories.usedBy', { count: usage })}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>

      <CategoryPicker
        visible={parentSheet}
        onClose={() => setParentSheet(false)}
        title={t('categories.fields.parent')}
        tree={tree}
        selectedId={parentId}
        onSelect={setParentId}
        parentsOnly
        noneLabel={t('categories.noParent')}
        onSelectNone={() => setParentId(null)}
        excludeId={category?.id}
      />
      {category ? (
        <CategoryPicker
          visible={replacementSheet}
          onClose={() => setReplacementSheet(false)}
          title={t('categories.chooseReplacement', { count: usage })}
          tree={tree
            .filter((node) => node.id !== category.id)
            .map((node) => ({
              ...node,
              children: node.children.filter((c) => c.id !== category.id),
            }))}
          selectedId={null}
          onSelect={(replacementId) => removeWith(category, replacementId)}
        />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.spacing[4] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[2] },
  iconCell: {
    width: t.touchTarget,
    height: t.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  colorCell: {
    width: t.touchTarget,
    height: t.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.full,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  selectedCell: { borderColor: t.colors.primary, borderWidth: 2 },
  swatch: { width: t.iconSizes.lg, height: t.iconSizes.lg, borderRadius: t.radius.full },
}));
