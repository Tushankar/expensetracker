import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressRingProps = {
  /** 0–1. Clamped. */
  value: number;
  size: number;
  thickness?: number;
  color: string;
  /** Second gradient stop. Defaults to `color`, giving a flat ring. */
  colorEnd?: string;
  trackColor?: string;
  children?: ReactNode;
  accessibilityLabel?: string;
  /** Unique within a screen — SVG gradient ids are document-global. */
  gradientId?: string;
};

/**
 * The savings ring. Sweeps up from zero on mount so the number in the middle lands
 * with it, which is the one piece of motion on Home that carries meaning rather
 * than decoration.
 */
export function ProgressRing({
  value,
  size,
  thickness = 12,
  color,
  colorEnd,
  trackColor,
  children,
  accessibilityLabel,
  gradientId = 'ring',
}: ProgressRingProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useSharedValue(reduceMotion ? clamped : 0);

  useEffect(() => {
    progress.value = reduceMotion
      ? clamped
      : withTiming(clamped, { duration: 900, easing: theme.easing.decelerate });
  }, [clamped, progress, reduceMotion, theme.easing.decelerate]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} />
            <Stop offset="1" stopColor={colorEnd ?? color} />
          </LinearGradient>
        </Defs>

        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor ?? theme.colors.surfaceMuted}
            strokeWidth={thickness}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth={thickness}
            strokeDasharray={circumference}
            strokeLinecap="round"
            fill="none"
            animatedProps={animatedProps}
          />
        </G>
      </Svg>

      {children ? (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.noTouch]}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  noTouch: { pointerEvents: 'none' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
