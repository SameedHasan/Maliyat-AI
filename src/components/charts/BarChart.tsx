import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme';

import { ChartFrame } from './ChartFrame';

export interface BarDatum {
  key: string;
  /** Axis label; empty strings are skipped. */
  label: string;
  /** One value per series, all ≥ 0. */
  values: readonly number[];
}

export interface BarChartProps {
  data: readonly BarDatum[];
  colors: readonly string[];
  height?: number;
  accessibilityLabel: string;
  /** Index of a bar to emphasise (e.g. the selected month). */
  highlightIndex?: number;
}

const AXIS_HEIGHT = 18;

export function BarChart({
  data,
  colors,
  height = 160,
  accessibilityLabel,
  highlightIndex,
}: BarChartProps) {
  const theme = useTheme();
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const seriesCount = Math.max(1, ...data.map((d) => d.values.length));
  const plotHeight = height - AXIS_HEIGHT;

  return (
    <ChartFrame height={height} accessibilityLabel={accessibilityLabel}>
      {(width) => {
        const slot = width / Math.max(data.length, 1);
        const gap = Math.max(1, Math.min(slot * 0.25, 8));
        const barWidth = Math.max(1, (slot - gap) / seriesCount);
        return (
          <Svg width={width} height={height}>
            <Line
              x1={0}
              x2={width}
              y1={plotHeight}
              y2={plotHeight}
              stroke={theme.colors.border}
              strokeWidth={1}
            />
            {data.map((datum, index) => {
              const dim = highlightIndex !== undefined && highlightIndex !== index;
              return datum.values.map((value, series) => {
                const barHeight = (Math.max(value, 0) / max) * (plotHeight - 4);
                return (
                  <Rect
                    key={`${datum.key}-${series}`}
                    x={index * slot + gap / 2 + series * barWidth}
                    y={plotHeight - barHeight}
                    width={Math.max(barWidth - 1, 1)}
                    height={barHeight}
                    rx={Math.min(3, barWidth / 3)}
                    fill={colors[series % colors.length]}
                    opacity={dim ? 0.45 : 1}
                  />
                );
              });
            })}
            {data.map((datum, index) =>
              datum.label ? (
                <SvgText
                  key={`label-${datum.key}`}
                  x={index * slot + slot / 2}
                  y={height - 4}
                  fontSize={theme.typography.caption.fontSize - 1}
                  fill={theme.colors.textMuted}
                  textAnchor="middle">
                  {datum.label}
                </SvgText>
              ) : null,
            )}
          </Svg>
        );
      }}
    </ChartFrame>
  );
}
