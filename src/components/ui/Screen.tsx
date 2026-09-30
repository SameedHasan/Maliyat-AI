import type { PropsWithChildren, ReactElement } from 'react';
import { ScrollView, View, type RefreshControlProps } from 'react-native';

import { makeStyles } from '@/theme';

export interface ScreenProps extends PropsWithChildren {
  /** Wraps content in a ScrollView. Use `false` for screens that render their own list. */
  scroll?: boolean;
  padded?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
}

export function Screen({ scroll = false, padded = false, refreshControl, children }: ScreenProps) {
  const styles = useStyles();
  if (scroll) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.scrollContent, padded && styles.padded]}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.root, padded && styles.padded]}>{children}</View>;
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.background },
  scrollContent: { flexGrow: 1, paddingBottom: t.spacing[8] },
  padded: { paddingHorizontal: t.spacing[4], paddingTop: t.spacing[4] },
}));
