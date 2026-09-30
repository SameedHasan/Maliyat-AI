import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface SelectFieldProps {
  label: string;
  /** Display text of the current value; null shows the placeholder. */
  value: string | null;
  placeholder: string;
  onPress: () => void;
  icon?: IconName;
  error?: string | null;
  disabled?: boolean;
}

/** A field that opens a picker (bottom sheet, date dialog…) instead of the keyboard. */
export function SelectField({
  label,
  value,
  placeholder,
  onPress,
  icon,
  error,
  disabled,
}: SelectFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        accessibilityState={{ disabled: !!disabled }}
        aria-invalid={!!error}
        disabled={disabled}
        onPress={onPress}
        android_ripple={{ color: theme.colors.divider }}
        style={[styles.box, !!error && styles.invalid, disabled && styles.disabled]}>
        {icon ? <Icon name={icon} size="md" color="textSecondary" /> : null}
        <Text
          variant="body"
          color={value ? 'text' : 'textMuted'}
          numberOfLines={1}
          style={styles.value}>
          {value ?? placeholder}
        </Text>
        <Icon name="chevron-down" size="sm" color="textMuted" />
      </Pressable>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  field: { gap: t.spacing[1] },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[2],
    minHeight: t.touchTarget,
    paddingHorizontal: t.spacing[3],
    borderRadius: t.radius.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    overflow: 'hidden',
  },
  value: { flex: 1 },
  invalid: { borderColor: t.colors.danger },
  disabled: { opacity: 0.5 },
}));
