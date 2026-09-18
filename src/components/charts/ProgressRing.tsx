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

import { GlassSurface } from '@/components/ui';
import { useTheme, type GlassTone } from '@/theme';

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
  /** Material for the disc inside the ring. `none` leaves it open. */
  centerTone?: GlassTone | 'none';
  accessibilityLabel?: string;
  /** Unique within a screen — SVG gradient ids are document-global. */
  gradientId?: string;
};

/**
 * The savings ring. Sweeps up from zero on mount so the number in the middle lands
 * with it, which is the one piece of motion on Home that carries meaning rather
 * than decoration.
 *
 * Built like the donut: a translucent track, a hairline along each face of the
 * band, and a disc of the same material carrying the figure in the middle.
 */
export function ProgressRing({
  value,
  size,
  thickness = 12,
  color,
  colorEnd,
  trackColor,
  children,
  centerTone = 'thin',
  accessibilityLabel,
  gradientId = 'ring',
}: ProgressRingProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  const outerEdge = radius + thickness / 2 - 0.5;
  const innerEdge = radius - thickness / 2 + 0.5;
  const holeSize = Math.max(0, (radius - thickness / 2) * 2);

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
      {centerTone === 'none' || holeSize <= 0 ? null : (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.noTouch]}>
          <GlassSurface
            tone={centerTone}
            radius={holeSize / 2}
            sheen={false}
            // The band draws its own inner hairline exactly here.
            rim={false}
            style={{ width: holeSize, height: holeSize }}
          />
        </View>
      )}

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
            stroke={trackColor ?? theme.glass.thin.fill}
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

          <Circle
            cx={size / 2}
            cy={size / 2}
            r={outerEdge}
            stroke={theme.glass.regular.highlight}
            strokeWidth={1}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={innerEdge}
            stroke={theme.glass.thin.border}
            strokeWidth={1}
            fill="none"
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
