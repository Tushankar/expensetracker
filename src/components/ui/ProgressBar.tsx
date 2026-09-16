import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

export type ProgressBarProps = {
  /** 0–1. Values outside the range are clamped. */
  value: number;
  color?: string;
  trackColor?: string;
  height?: number;
  /** Announced to screen readers, e.g. "Food budget". */
  accessibilityLabel?: string;
  style?: ViewStyle;
};

/**
 * Thin, rounded progress track. Animates from 0 on mount so a screen of budgets
 * fills in rather than snapping.
 */
export function ProgressBar({
  value,
  color,
  trackColor,
  height = 6,
  accessibilityLabel,
  style,
}: ProgressBarProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const progress = useSharedValue(reduceMotion ? clamped : 0);

  useEffect(() => {
    progress.value = reduceMotion
      ? clamped
      : withTiming(clamped, { duration: theme.duration.slow, easing: theme.easing.standard });
  }, [clamped, progress, reduceMotion, theme.duration.slow, theme.easing.standard]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[
        {
          height,
          borderRadius: height / 2,
          backgroundColor: trackColor ?? theme.colors.surfaceStrong,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          fillStyle,
          {
            height: '100%',
            borderRadius: height / 2,
            backgroundColor: color ?? theme.colors.brand,
          },
        ]}
      />
    </View>
  );
}
