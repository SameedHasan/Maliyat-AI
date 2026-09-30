import { Switch } from 'react-native';

import { useTheme } from '@/theme';

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

export function Toggle({ value, onValueChange, accessibilityLabel, disabled }: ToggleProps) {
  const theme = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
      thumbColor={theme.colors.surface}
    />
  );
}
