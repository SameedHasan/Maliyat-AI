import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Text } from './Text';

export interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View
      style={styles.track}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            android_ripple={{ color: theme.colors.divider }}
            style={[styles.segment, selected && styles.selected]}>
            <Text
              variant="bodySmall"
              color={selected ? 'onPrimary' : 'textSecondary'}
              numberOfLines={1}
              style={styles.label}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    flexDirection: 'row',
    padding: t.spacing[1],
    gap: t.spacing[1],
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceAlt,
  },
  segment: {
    flex: 1,
    minHeight: t.touchTarget - t.spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.spacing[2],
    borderRadius: t.radius.sm,
    overflow: 'hidden',
  },
  selected: { backgroundColor: t.colors.primary },
  label: { fontWeight: '600' },
}));
