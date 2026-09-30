import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet, Divider, EmptyState, Icon, ListItem, type IconName } from '@/components/ui';
import type { CategoryNode } from '@/data/repositories';
import { makeStyles } from '@/theme';

export interface CategoryPickerProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  tree: readonly CategoryNode[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
  /** Only top-level categories can be picked (e.g. choosing a parent). */
  parentsOnly?: boolean;
  /** Optional "none" row, e.g. for "no parent". */
  noneLabel?: string;
  onSelectNone?: () => void;
  excludeId?: string;
}

export function CategoryPicker({
  visible,
  onClose,
  title,
  tree,
  selectedId,
  onSelect,
  parentsOnly = false,
  noneLabel,
  onSelectNone,
  excludeId,
}: CategoryPickerProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const pick = (id: string) => {
    onSelect(id);
    onClose();
  };
  const check = (id: string | null) =>
    id === selectedId ? <Icon name="checkmark" color="primary" /> : null;

  const parents = tree.filter((node) => node.id !== excludeId);
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {noneLabel && onSelectNone ? (
        <>
          <ListItem
            icon="remove-outline"
            title={noneLabel}
            onPress={() => {
              onSelectNone();
              onClose();
            }}
            trailing={check(null)}
          />
          <Divider />
        </>
      ) : null}
      {parents.length === 0 ? (
        <EmptyState icon="pricetags-outline" title={t('categories.emptyTitle')} />
      ) : (
        parents.map((parent, index) => (
          <View key={parent.id}>
            {index > 0 ? <Divider /> : null}
            <ListItem
              icon={(parent.icon ?? 'pricetag-outline') as IconName}
              title={parent.name}
              accessibilityLabel={parent.name}
              onPress={() => pick(parent.id)}
              trailing={check(parent.id)}
            />
            {parentsOnly
              ? null
              : parent.children.map((child) => (
                  <View key={child.id} style={styles.child}>
                    <ListItem
                      icon={(child.icon ?? 'pricetag-outline') as IconName}
                      title={child.name}
                      accessibilityLabel={t('categories.childOf', {
                        name: child.name,
                        parent: parent.name,
                      })}
                      onPress={() => pick(child.id)}
                      trailing={check(child.id)}
                    />
                  </View>
                ))}
          </View>
        ))
      )}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  child: { paddingStart: t.spacing[6] },
}));
