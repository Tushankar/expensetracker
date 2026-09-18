import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
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
  sublabel?: string;
  isPeak?: boolean;
};

export type BarChartProps = {
  data: readonly Bar[];
  color: string;
  height?: number;
  /** Space between bars. Drop it to 3–4 for the thumbnail charts on stat tiles. */
  gap?: number;
  barRadius?: number;
  /** Maximum width of a single bar so few bars don't stretch into massive blocks. */
  maxBarWidth?: number;
  /** Show subtle background track pills behind each bar. */
  showTrack?: boolean;
  /** Show the label row under the bars. */
  showLabels?: boolean;
  /** Currently selected/highlighted bar index. */
  selectedIndex?: number | null;
  /** Callback when a bar is pressed. */
  onSelectIndex?: (index: number) => void;
  /** Screen-reader summary; the bars themselves carry no labels. */
  accessibilityLabel?: string;
  /** Formats each bar's value for the accessibility summary. */
  formatValue?: (value: number) => string;
};

/**
 * Vertical bars with modern pill tracks and interactive selection.
 *
 * Each bar sits inside a subtle track pill so empty/quiet days have visual
 * structure rather than disappearing into voids, and few bars never stretch
 * into giant solid blocks.
 */
export function BarChart({
  data,
  color,
  height = 96,
  gap,
  barRadius = 5,
  maxBarWidth = 32,
  showTrack = true,
  showLabels = true,
  selectedIndex,
  onSelectIndex,
  accessibilityLabel,
  formatValue,
}: BarChartProps) {
  const theme = useTheme();
  const max = Math.max(...data.map((bar) => bar.value), 1);
  const barGap = gap ?? (data.length > 20 ? 3 : data.length > 10 ? 5 : theme.spacing.sm);

  const summary =
    accessibilityLabel ??
    data
      .map((bar) => `${bar.label}: ${formatValue ? formatValue(bar.value) : bar.value}`)
      .join(', ');

  const fewBars = data.length <= 4;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      {/* Chart Bars Area */}
      <View
        style={{
          height,
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: fewBars ? 'center' : 'space-between',
          gap: barGap,
        }}
      >
        {data.map((bar, index) => {
          const isSelected = selectedIndex === index;
          const hasValue = bar.value > 0;
          const barHeight = hasValue ? Math.max(8, (bar.value / max) * height) : 3;
          const barOpacity = isSelected
            ? 1
            : hasValue
              ? 0.7 + (bar.value / max) * 0.3
              : 0.25;

          return (
            <Pressable
              key={`${bar.label}-${index}`}
              onPress={() => onSelectIndex?.(index)}
              accessibilityRole="button"
              accessibilityLabel={`${bar.label}, ${formatValue ? formatValue(bar.value) : bar.value}`}
              style={{
                flex: fewBars ? undefined : 1,
                width: fewBars ? maxBarWidth : undefined,
                maxWidth: maxBarWidth,
                height: '100%',
                justifyContent: 'flex-end',
                alignItems: 'center',
              }}
            >
              {/* Background Track Pill */}
              <View
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: barRadius,
                  backgroundColor: isSelected
                    ? theme.colors.surfaceStrong
                    : showTrack
                      ? theme.colors.surfaceMuted
                      : 'transparent',
                  justifyContent: 'flex-end',
                  overflow: 'hidden',
                  borderWidth: isSelected ? 1 : 0,
                  borderColor: isSelected ? theme.colors.brand : 'transparent',
                }}
              >
                <GrowingBar
                  height={barHeight}
                  opacity={barOpacity}
                  color={bar.isPeak ? (theme.colors.warning ?? color) : color}
                  radius={barRadius}
                  index={index}
                />
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Label Row */}
      {showLabels && data.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: fewBars ? 'center' : 'space-between',
            gap: barGap,
            marginTop: theme.spacing.sm,
          }}
        >
          {data.map((bar, index) => {
            const isSelected = selectedIndex === index;
            // For dense charts (>14 bars), only show sparse labels (start, end, intervals of 5 or 7, or selected)
            const shouldShow =
              data.length <= 14 ||
              index === 0 ||
              index === data.length - 1 ||
              (data.length <= 31 && (index + 1) % 5 === 0) ||
              isSelected;

            return (
              <View
                key={`${bar.label}-${index}`}
                style={{
                  flex: fewBars ? undefined : 1,
                  width: fewBars ? maxBarWidth : undefined,
                  maxWidth: maxBarWidth,
                  alignItems: 'center',
                }}
              >
                <Text
                  variant="caption"
                  tone={isSelected ? 'primary' : 'tertiary'}
                  align="center"
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.1}
                  style={{
                    fontSize: data.length > 15 ? 10 : 11,
                    fontWeight: isSelected ? '700' : '500',
                    color: isSelected ? theme.colors.brandText : undefined,
                    opacity: shouldShow ? 1 : 0,
                  }}
                >
                  {bar.label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One bar, growing from the axis with a smooth entrance animation.
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
          Math.min(index, 12) * 25,
          withTiming(height, { duration: 380, easing: theme.easing.decelerate }),
        );
  }, [grown, height, index, reduceMotion, theme.easing.decelerate]);

  const style = useAnimatedStyle(() => ({ height: grown.value }));

  return (
    <Animated.View
      style={[
        style,
        {
          width: '100%',
          borderTopLeftRadius: radius,
          borderTopRightRadius: radius,
          borderBottomLeftRadius: radius,
          borderBottomRightRadius: radius,
          backgroundColor: color,
          opacity,
        },
      ]}
    />
  );
}
