import { useEffect } from 'react';
import { View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  /** Defaults to a pill for short bars and a card radius for tall blocks. */
  radius?: number;
  style?: ViewStyle;
};

/**
 * Placeholder block for content that is still loading.
 *
 * It pulses opacity rather than sweeping a gradient highlight: a sweep animates
 * forever in the corner of the eye and reads as busy, which is the opposite of what
 * a loading screen should feel like. Every skeleton mounted in the same frame stays
 * in phase, so a loading screen breathes as one.
 */
export function Skeleton({ width = '100%', height = 14, radius, style }: SkeletonProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: theme.duration.ambient, easing: theme.easing.standard }),
        withTiming(1, { duration: theme.duration.ambient, easing: theme.easing.standard }),
      ),
      -1,
      false,
    );
  }, [pulse, reduceMotion, theme.duration.ambient, theme.easing.standard]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        animatedStyle,
        {
          width,
          height,
          borderRadius: radius ?? (height > 40 ? theme.radius.md : height / 2),
          backgroundColor: theme.colors.skeleton,
        },
        style,
      ]}
    />
  );
}

export type SkeletonTextProps = {
  lines?: number;
  /** Width of the final line — real paragraphs rarely end flush. */
  lastLineWidth?: DimensionValue;
  gap?: number;
  lineHeight?: number;
};

export function SkeletonText({
  lines = 3,
  lastLineWidth = '62%',
  gap = 10,
  lineHeight = 12,
}: SkeletonTextProps) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          height={lineHeight}
          width={index === lines - 1 ? lastLineWidth : '100%'}
        />
      ))}
    </View>
  );
}

/**
 * Loading placeholder shaped like a transaction row, so the list does not reflow
 * when real data arrives.
 */
export function SkeletonRow() {
  const { spacing, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <Skeleton width={44} height={44} radius={radius.sm} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="32%" height={11} />
      </View>
      <Skeleton width={64} height={13} />
    </View>
  );
}
