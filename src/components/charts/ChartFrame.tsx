import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

export interface ChartFrameProps {
  height: number;
  /** Spoken summary of the chart's values; the drawing itself is hidden from screen readers. */
  accessibilityLabel: string;
  children: (width: number) => ReactNode;
}

/** Measures the available width and renders the chart once it is known. */
export function ChartFrame({ height, accessibilityLabel, children }: ChartFrameProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };
  return (
    <View
      onLayout={onLayout}
      style={{ height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {width > 0 ? children(width) : null}
      </View>
    </View>
  );
}
