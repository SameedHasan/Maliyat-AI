import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Rendered at the end of the row (amount, switch, chevron…). */
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function ListItem({
  title,
  subtitle,
  icon,
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: ListItemProps) {
  const styles = useStyles();
  const theme = useTheme();

  const content = (
    <>
      {icon ? (
        <View style={styles.iconWrap}>
          <Icon name={icon} size="md" color="textSecondary" />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text variant="body" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" color="textMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      android_ripple={{ color: theme.colors.divider }}
      style={styles.row}>
      {content}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    minHeight: t.touchTarget + t.spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.spacing[4],
    paddingVertical: t.spacing[2],
    gap: t.spacing[3],
    backgroundColor: t.colors.surface,
  },
  iconWrap: {
    width: t.iconSizes.lg,
    alignItems: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  trailing: { alignItems: 'flex-end', flexShrink: 0 },
}));
