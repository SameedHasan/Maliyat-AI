import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSnackbar } from '@/store/snackbar';
import { makeStyles, useTheme } from '@/theme';

import { Text } from './Text';

const DURATION_MS = 5000;
/** Keeps the snackbar clear of the bottom tab bar. */
const BOTTOM_OFFSET = 64;

export function SnackbarHost() {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const current = useSnackbar((s) => s.current);
  const dismiss = useSnackbar((s) => s.dismiss);

  useEffect(() => {
    if (!current) return;
    AccessibilityInfo.announceForAccessibility(current.message);
    const handle = setTimeout(() => dismiss(current.id), DURATION_MS);
    return () => clearTimeout(handle);
  }, [current, dismiss]);

  if (!current) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { bottom: insets.bottom + BOTTOM_OFFSET }]}>
      <View style={styles.bar} accessibilityLiveRegion="polite">
        <Text variant="bodySmall" style={styles.message}>
          {current.message}
        </Text>
        {current.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={current.action.label}
            hitSlop={theme.hitSlop}
            onPress={() => {
              current.action?.onPress();
              dismiss(current.id);
            }}>
            <Text variant="bodySmall" style={styles.action}>
              {current.action.label.toUpperCase()}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { position: 'absolute', start: t.spacing[4], end: t.spacing[4] },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[4],
    minHeight: t.touchTarget,
    paddingHorizontal: t.spacing[4],
    paddingVertical: t.spacing[2],
    borderRadius: t.radius.md,
    backgroundColor: t.colors.text,
  },
  message: { flex: 1, color: t.colors.background },
  action: { color: t.colors.background, fontWeight: '700' },
}));
