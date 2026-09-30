import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles } from '@/theme';

import { Text } from './Text';

export interface StatProps {
  label: string;
  /** Usually a `MoneyText`. */
  value: ReactNode;
  hint?: string;
}

export function Stat({ label, value, hint }: StatProps) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      {value}
      {hint ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  stat: { flex: 1, gap: t.spacing[1], minWidth: 0 },
}));
