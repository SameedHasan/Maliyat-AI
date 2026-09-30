import { View } from 'react-native';

import { makeStyles } from '@/theme';

export interface ProgressBarProps {
  /** 0–1; values above 1 render full. */
  progress: number;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  accessibilityLabel: string;
}

export function ProgressBar({ progress, tone = 'primary', accessibilityLabel }: ProgressBarProps) {
  const styles = useStyles();
  const clamped = Math.min(Math.max(progress, 0), 1);
  return (
    <View
      style={styles.track}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}>
      <View style={[styles.fill, styles[tone], { width: `${clamped * 100}%` }]} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    height: t.spacing[2],
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: t.radius.full },
  primary: { backgroundColor: t.colors.primary },
  success: { backgroundColor: t.colors.success },
  warning: { backgroundColor: t.colors.warning },
  danger: { backgroundColor: t.colors.danger },
}));
