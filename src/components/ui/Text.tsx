import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type ColorTokens, type TypographyVariant } from '@/theme';

type TextColor = Exclude<keyof ColorTokens, 'charts'>;

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: TextColor;
  align?: 'auto' | 'left' | 'center' | 'right';
  /** Tabular figures so digits line up in columns. */
  tabular?: boolean;
}

export function Text({
  variant = 'body',
  color = 'text',
  align,
  tabular,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        theme.typography[variant],
        { color: theme.colors[color] },
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}
