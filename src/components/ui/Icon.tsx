import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { useTheme, type ColorTokens, type iconSizes } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface IconProps {
  name: IconName;
  size?: keyof typeof iconSizes;
  color?: Exclude<keyof ColorTokens, 'charts'>;
}

/** Decorative by default; give the parent control the accessibility label. */
export function Icon({ name, size = 'md', color = 'textSecondary' }: IconProps) {
  const theme = useTheme();
  return (
    <Ionicons
      name={name}
      size={theme.iconSizes[size]}
      color={theme.colors[color]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
