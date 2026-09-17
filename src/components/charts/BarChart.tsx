import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

export type Bar = {
  label: string;
  value: number;
};

export type BarChartProps = {
  data: readonly Bar[];
  color: string;
  height?: number;
  /** Space between bars. Drop it to 3–4 for the thumbnail charts on stat tiles. */
  gap?: number;
  barRadius?: number;
  /** Show the label row under the bars. */
  showLabels?: boolean;
  /** Screen-reader summary; the bars themselves carry no labels. */
  accessibilityLabel?: string;
  /** Formats each bar's value for the accessibility summary. */
  formatValue?: (value: number) => string;
};

/**
 * Vertical bars, drawn with plain Views rather than SVG — at this size a rounded
 * rect is a rounded rect, and Views keep the bars in the same layout pass as their
 * labels so the two can never drift apart.
 *
 * The tallest bar is full height and the rest are relative to it; a zero-height bar
 * still paints a stub so an empty week reads as "nothing" instead of "missing".
 */
export function BarChart({
  data,
  color,
  height = 76,
  gap,
  barRadius = 6,
  showLabels = true,
  accessibilityLabel,
  formatValue,
}: BarChartProps) {
  const theme = useTheme();
  const max = Math.max(...data.map((bar) => bar.value), 1);
  const barGap = gap ?? theme.spacing.sm;

  const summary =
    accessibilityLabel ??
    data
      .map((bar) => `${bar.label}: ${formatValue ? formatValue(bar.value) : bar.value}`)
      .join(', ');

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View
        style={{
          height,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: barGap,
        }}
      >
        {data.map((bar, index) => (
          <GrowingBar
            key={bar.label}
            height={Math.max(4, (bar.value / max) * height)}
            // The shortest bars read as pale stubs, the tallest as solid — cheaper
            // than a gradient and it survives a theme flip.
            opacity={0.45 + (bar.value / max) * 0.55}
            color={color}
            radius={barRadius}
            index={index}
          />
        ))}
      </View>

      {showLabels ? (
        <View style={{ flexDirection: 'row', gap: barGap, marginTop: theme.spacing.sm }}>
          {data.map((bar) => (
            <Text
              key={bar.label}
              variant="caption"
              tone="tertiary"
              align="center"
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
              style={{ flex: 1 }}
            >
              {bar.label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One bar, growing from the axis.
 *
 * Staggered by a few milliseconds each so a row reads left to right rather than
 * inflating as one block — the difference between a chart that appears and a
 * chart that draws itself. Capped so a twelve-month series does not turn a
 * flourish into a wait.
 *
 * It animates on mount and on any change of height, which is what makes switching
 * period feel like the same chart re-reading rather than a new one appearing.
 */
function GrowingBar({
  height,
  opacity,
  color,
  radius,
  index,
}: {
  height: number;
  opacity: number;
  color: string;
  radius: number;
  index: number;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const grown = useSharedValue(reduceMotion ? height : 0);

  useEffect(() => {
    grown.value = reduceMotion
      ? height
      : withDelay(
          Math.min(index, 8) * 35,
          withTiming(height, { duration: 420, easing: theme.easing.decelerate }),
        );
  }, [grown, height, index, reduceMotion, theme.easing.decelerate]);

  const style = useAnimatedStyle(() => ({ height: grown.value }));

  return (
    <Animated.View
      style={[style, { flex: 1, borderRadius: radius, backgroundColor: color, opacity }]}
    />
  );
}
