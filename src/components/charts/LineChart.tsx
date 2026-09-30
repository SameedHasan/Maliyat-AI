import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme';

import { ChartFrame } from './ChartFrame';

export interface LineSeries {
  key: string;
  color: string;
  /** Null leaves a gap (e.g. future days of the current month). */
  values: readonly (number | null)[];
  dashed?: boolean;
}

export interface LineChartProps {
  series: readonly LineSeries[];
  /** Labels under the first and last points. */
  startLabel?: string;
  endLabel?: string;
  height?: number;
  accessibilityLabel: string;
}

const AXIS_HEIGHT = 18;
const PAD = 4;

function pathFor(
  values: readonly (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let d = '';
  let drawing = false;
  values.forEach((value, i) => {
    if (value === null) {
      drawing = false;
      return;
    }
    d += `${drawing ? 'L' : 'M'}${x(i).toFixed(1)},${y(value).toFixed(1)}`;
    drawing = true;
  });
  return d;
}

export function LineChart({
  series,
  startLabel,
  endLabel,
  height = 160,
  accessibilityLabel,
}: LineChartProps) {
  const theme = useTheme();
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const points = Math.max(2, ...series.map((s) => s.values.length));
  const plotHeight = height - AXIS_HEIGHT;
  const y = (v: number) => PAD + (1 - (v - min) / span) * (plotHeight - PAD * 2);

  return (
    <ChartFrame height={height} accessibilityLabel={accessibilityLabel}>
      {(width) => {
        const x = (i: number) => PAD + (i / (points - 1)) * (width - PAD * 2);
        return (
          <Svg width={width} height={height}>
            <Line
              x1={0}
              x2={width}
              y1={y(0)}
              y2={y(0)}
              stroke={theme.colors.border}
              strokeWidth={1}
            />
            {series.map((s) => (
              <Path
                key={s.key}
                d={pathFor(s.values, x, y)}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '4 4' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
              />
            ))}
            {startLabel ? (
              <SvgText
                x={PAD}
                y={height - 4}
                fontSize={theme.typography.caption.fontSize - 1}
                fill={theme.colors.textMuted}>
                {startLabel}
              </SvgText>
            ) : null}
            {endLabel ? (
              <SvgText
                x={width - PAD}
                y={height - 4}
                fontSize={theme.typography.caption.fontSize - 1}
                fill={theme.colors.textMuted}
                textAnchor="end">
                {endLabel}
              </SvgText>
            ) : null}
          </Svg>
        );
      }}
    </ChartFrame>
  );
}
