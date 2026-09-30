import { Pressable } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  accessibilityHint?: string;
}

export function Chip({ label, selected = false, onPress, icon, accessibilityHint }: ChipProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      android_ripple={{ color: theme.colors.divider }}
      style={[styles.chip, selected && styles.selected]}>
      {icon ? (
        <Icon name={icon} size="sm" color={selected ? 'onPrimary' : 'textSecondary'} />
      ) : null}
      <Text variant="bodySmall" color={selected ? 'onPrimary' : 'text'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[1],
    minHeight: t.touchTarget - t.spacing[3],
    paddingHorizontal: t.spacing[3],
    borderRadius: t.radius.full,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    overflow: 'hidden',
  },
  selected: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
}));
