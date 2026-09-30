import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

export interface SurfaceProps extends PropsWithChildren {
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A bordered group on the page background. Deliberately plain: no shadows or tints. */
export function Surface({ padded = false, style, children }: SurfaceProps) {
  const styles = useStyles();
  return <View style={[styles.surface, padded && styles.padded, style]}>{children}</View>;
}

const useStyles = makeStyles((t) => ({
  surface: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  padded: { padding: t.spacing[4] },
}));
