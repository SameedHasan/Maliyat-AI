import { View } from 'react-native';

import { makeStyles } from '@/theme';

import { Text } from './Text';

export interface BadgeProps {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

const TEXT_COLOR = {
  neutral: 'textSecondary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
} as const;

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const styles = useStyles();
  return (
    <View style={[styles.badge, styles[tone]]}>
      <Text variant="caption" color={TEXT_COLOR[tone]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: t.spacing[2],
    paddingVertical: t.spacing[0.5],
    borderRadius: t.radius.full,
    borderWidth: t.borders.hairline,
  },
  neutral: { borderColor: t.colors.border },
  success: { borderColor: t.colors.success },
  warning: { borderColor: t.colors.warning },
  danger: { borderColor: t.colors.danger },
}));
