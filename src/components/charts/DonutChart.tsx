import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '@/theme';

export interface DonutSegment {
  key: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  segments: readonly DonutSegment[];
  size?: number;
  thickness?: number;
  accessibilityLabel: string;
  /** Rendered in the hole, e.g. the total. */
  children?: ReactNode;
}

const SEGMENT_GAP = 2;

export function DonutChart({
  segments,
  size = 180,
  thickness = 22,
  accessibilityLabel,
  children,
}: DonutChartProps) {
  const theme = useTheme();
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
  const gap = segments.length > 1 ? SEGMENT_GAP : 0;

  const lengths = segments.map((segment) =>
    total > 0 ? (Math.max(segment.value, 0) / total) * circumference : 0,
  );
  const arcs = segments.map((segment, index) => ({
    ...segment,
    length: Math.max((lengths[index] ?? 0) - gap, 0),
    offset: lengths.slice(0, index).reduce((sum, length) => sum + length, 0),
  }));

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size} importantForAccessibility="no-hide-descendants">
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.colors.surfaceAlt}
            strokeWidth={thickness}
            fill="none"
          />
          {arcs.map((arc) => (
            <Circle
              key={arc.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={arc.color}
              strokeWidth={thickness}
              strokeDasharray={`${arc.length} ${circumference - arc.length}`}
              strokeDashoffset={-arc.offset}
              fill="none"
            />
          ))}
        </G>
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
