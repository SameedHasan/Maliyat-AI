import { Pressable, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { makeStyles, useTheme } from '@/theme';

import { Icon } from './Icon';

export interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}

export function SearchInput({ value, onChangeText, placeholder }: SearchInputProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.box}>
      <Icon name="search" size="md" color="textMuted" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        cursorColor={theme.colors.primary}
        selectionColor={theme.colors.primary}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        style={styles.input}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.clearSearch')}
          onPress={() => onChangeText('')}
          hitSlop={theme.hitSlop}>
          <Icon name="close-circle" size="md" color="textMuted" />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[2],
    minHeight: t.touchTarget - t.spacing[1],
    paddingHorizontal: t.spacing[3],
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceAlt,
  },
  input: { ...t.typography.body, flex: 1, color: t.colors.text, paddingVertical: t.spacing[2] },
}));
