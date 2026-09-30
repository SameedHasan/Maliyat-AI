import type { IconName } from '@/components/ui';
import type { Theme } from '@/theme';

/** Stored in `categories.color`; resolved against the active theme so both modes stay legible. */
export const CATEGORY_COLOR_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const;
export type CategoryColorKey = (typeof CATEGORY_COLOR_KEYS)[number];

export function categoryColor(
  theme: Theme,
  color: string | null | undefined,
  fallbackIndex: number,
): string {
  const keyIndex = CATEGORY_COLOR_KEYS.indexOf(color as CategoryColorKey);
  const palette = theme.colors.charts;
  return palette[(keyIndex >= 0 ? keyIndex : fallbackIndex) % palette.length]!;
}

export const CATEGORY_ICONS: readonly IconName[] = [
  'pricetag-outline',
  'restaurant-outline',
  'cart-outline',
  'cafe-outline',
  'fast-food-outline',
  'car-outline',
  'bus-outline',
  'speedometer-outline',
  'home-outline',
  'flash-outline',
  'water-outline',
  'wifi-outline',
  'phone-portrait-outline',
  'shirt-outline',
  'basket-outline',
  'medkit-outline',
  'school-outline',
  'book-outline',
  'film-outline',
  'game-controller-outline',
  'airplane-outline',
  'gift-outline',
  'heart-outline',
  'people-outline',
  'paw-outline',
  'barbell-outline',
  'briefcase-outline',
  'laptop-outline',
  'trending-up-outline',
  'cash-outline',
  'card-outline',
  'ellipsis-horizontal-outline',
];
