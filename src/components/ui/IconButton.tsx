import { Pressable } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';

export interface IconButtonProps {
  icon: IconName;
  /** Required: icon-only controls are otherwise invisible to screen readers. */
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}

export function IconButton({ icon, accessibilityLabel, onPress, disabled }: IconButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={theme.hitSlop}
      android_ripple={{ color: theme.colors.divider, borderless: true }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Icon name={icon} size="lg" color="text" />
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  button: {
    width: t.touchTarget,
    height: t.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.full,
  },
  pressed: { opacity: 0.6 },
}));
