import type { TextStyle } from 'react-native';

export interface ColorTokens {
  primary: string;
  onPrimary: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  divider: string;
  income: string;
  expense: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  /** Backdrop behind sheets and dialogs. */
  scrim: string;
  charts: readonly [string, string, string, string, string, string];
}

// Text colours are chosen for ≥ 4.5:1 contrast against both background and surface.
const light: ColorTokens = {
  primary: '#2447C7',
  onPrimary: '#FFFFFF',
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F3',
  text: '#111318',
  textSecondary: '#474D57',
  textMuted: '#646B76',
  border: '#DDE1E6',
  divider: '#E9ECEF',
  income: '#0B7A52',
  expense: '#B42D25',
  success: '#0B7A52',
  danger: '#B42D25',
  warning: '#8F5600',
  info: '#1D5FD1',
  scrim: 'rgba(17, 19, 24, 0.4)',
  charts: ['#2447C7', '#0B7A52', '#C77A12', '#8A3FB8', '#1F8FA3', '#B8475B'],
};

const dark: ColorTokens = {
  primary: '#8EA8FF',
  onPrimary: '#0F1115',
  background: '#0F1115',
  surface: '#171A20',
  surfaceAlt: '#1F232B',
  text: '#F1F3F6',
  textSecondary: '#B7BDC7',
  textMuted: '#9098A5',
  border: '#2B3039',
  divider: '#22262E',
  income: '#4CD49A',
  expense: '#FF8A80',
  success: '#4CD49A',
  danger: '#FF8A80',
  warning: '#F2B35B',
  info: '#79A8FF',
  scrim: 'rgba(0, 0, 0, 0.6)',
  charts: ['#8EA8FF', '#4CD49A', '#F2B35B', '#C79BF2', '#5FC9DB', '#F28DA0'],
};

export const palettes = { light, dark } as const;
export type ColorSchemeName = keyof typeof palettes;

/** 4-point scale; index by step (`spacing[4]` = 16). */
export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radius = { sm: 6, md: 10, lg: 14, full: 999 } as const;

export const iconSizes = { sm: 16, md: 20, lg: 24, xl: 32, xxl: 48 } as const;

export const borders = { hairline: 1 } as const;

/** Android recommends 48dp touch targets (plan §7.5 asks for at least 44). */
export const touchTarget = 48;
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodySmall: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.2 },
  mono: { fontSize: 15, lineHeight: 22, fontWeight: '500', fontVariant: tabular },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export function createTheme(scheme: ColorSchemeName) {
  return {
    scheme,
    colors: palettes[scheme],
    spacing,
    radius,
    iconSizes,
    borders,
    typography,
    touchTarget,
    hitSlop,
  };
}

export type Theme = ReturnType<typeof createTheme>;
