import type { PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

export interface BottomSheetProps extends PropsWithChildren {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Set to false when children render their own scrolling list. */
  scroll?: boolean;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  scroll = true,
  children,
}: BottomSheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text variant="heading" accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <IconButton icon="close" accessibilityLabel={t('common.close')} onPress={onClose} />
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
              {children}
            </ScrollView>
          ) : (
            <View style={styles.fill}>{children}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: t.colors.scrim },
  sheet: {
    maxHeight: '85%',
    backgroundColor: t.colors.surface,
    borderTopStartRadius: t.radius.lg,
    borderTopEndRadius: t.radius.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: t.spacing[4],
    paddingEnd: t.spacing[1],
    paddingTop: t.spacing[1],
  },
  title: { flex: 1 },
  content: { paddingBottom: t.spacing[4] },
  fill: { flexShrink: 1 },
}));
