import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text variant="caption" color="textSecondary" accessibilityRole="header" style={styles.title}>
        {title.toUpperCase()}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={theme.hitSlop}>
          <Text variant="bodySmall" color="primary">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing[4],
    paddingTop: t.spacing[6],
    paddingBottom: t.spacing[2],
  },
  title: { flexShrink: 1 },
}));
