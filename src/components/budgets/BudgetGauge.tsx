import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * How much of the circle the gauge uses. The missing 100° at the bottom is what
 * makes it read as a dial rather than a pie — a full ring has no start and no
 * end, and a budget has both.
 */
const SWEEP_DEG = 260;
const GAP_DEG = 360 - SWEEP_DEG;
/** Clockwise offset from 3 o'clock to the arc's start, so the gap sits at the bottom. */
const START_DEG = 90 + GAP_DEG / 2;

export type BudgetGaugeProps = {
  /** 0–1. Clamped: a blown budget is said in colour and words, never by overdrawing the arc. */
  value: number;
  size: number;
  thickness?: number;
  color: string;
  /** Second gradient stop. Defaults to `color` for a flat arc. */
  colorEnd?: string;
  trackColor?: string;
  /** 0–1. Draws the warning threshold as a notch across the track. */
  warnAt?: number;
  warnColor?: string;
  children?: ReactNode;
  accessibilityLabel?: string;
  /** Unique within a screen — SVG gradient ids are document-global. */
  gradientId?: string;
};

function polar(cx: number, cy: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

/**
 * The capacity dial on the budget hero.
 *
 * A budget is a container filling up, and an arc shows fullness at a glance in a
 * way a bar has to be read left-to-right to give. The threshold notch is the
 * point of the whole screen: it marks where the app will speak up, so the person
 * can see how close they are to being warned before they are.
 */
export function BudgetGauge({
  value,
  size,
  thickness = 12,
  color,
  colorEnd,
  trackColor,
  warnAt,
  warnColor,
  children,
  accessibilityLabel,
  gradientId = 'budgetGauge',
}: BudgetGaugeProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * (SWEEP_DEG / 360);

  const progress = useSharedValue(reduceMotion ? clamped : 0);

  useEffect(() => {
    progress.value = reduceMotion
      ? clamped
      : withTiming(clamped, { duration: 900, easing: theme.easing.decelerate });
  }, [clamped, progress, reduceMotion, theme.easing.decelerate]);

  // `dasharray` is one dash the length of the arc followed by a gap longer than the
  // circle, so the pattern never repeats; shifting the offset grows the dash from
  // the start point rather than sliding it around the ring.
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: arc * (1 - progress.value),
  }));

  const notch =
    warnAt !== undefined && warnAt > 0 && warnAt < 1
      ? {
          inner: polar(center, center, radius - thickness / 2, START_DEG + SWEEP_DEG * warnAt),
          outer: polar(center, center, radius + thickness / 2, START_DEG + SWEEP_DEG * warnAt),
        }
      : null;

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
          <LinearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={color} />
            <Stop offset="1" stopColor={colorEnd ?? color} />
          </LinearGradient>
        </Defs>

        <G rotation={START_DEG} originX={center} originY={center}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={trackColor ?? theme.colors.surfaceStrong}
            strokeWidth={thickness}
            strokeDasharray={[arc, circumference]}
            strokeLinecap="round"
            fill="none"
          />
          <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth={thickness}
            strokeDasharray={[arc, circumference]}
            strokeLinecap="round"
            fill="none"
            animatedProps={animatedProps}
          />
        </G>

        {notch ? (
          <Line
            x1={notch.inner.x}
            y1={notch.inner.y}
            x2={notch.outer.x}
            y2={notch.outer.y}
            stroke={warnColor ?? theme.colors.background}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.9}
          />
        ) : null}
      </Svg>

      {children ? (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.noTouch]}>{children}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  noTouch: { pointerEvents: 'none' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
