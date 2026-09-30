import { ActivityIndicator, Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  accessibilityHint,
}: ButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  const inactive = disabled || loading;
  const foreground =
    variant === 'primary' ? 'onPrimary' : variant === 'danger' ? 'danger' : 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      android_ripple={{ color: theme.colors.divider }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        inactive && styles.inactive,
        pressed && styles.pressed,
      ]}>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={theme.colors[foreground]} />
        ) : icon ? (
          <Icon name={icon} size="md" color={foreground} />
        ) : null}
        <Text variant="heading" color={foreground}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    minHeight: t.touchTarget,
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing[4],
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing[2],
  },
  primary: { backgroundColor: t.colors.primary },
  secondary: {
    backgroundColor: t.colors.surface,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.border,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: {
    backgroundColor: t.colors.surface,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.danger,
  },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
}));
