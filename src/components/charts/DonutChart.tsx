import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '@/theme';

export type DonutSegment = {
  key: string;
  /** 0–1. Shares should sum to ~1; anything past a full turn is simply not drawn. */
  share: number;
  color: string;
  /** Used only for the screen-reader summary. */
  label?: string;
};

export type DonutChartProps = {
  segments: readonly DonutSegment[];
  size: number;
  thickness?: number;
  /** Rendered in the hole — usually a total and a caption. */
  children?: ReactNode;
  accessibilityLabel?: string;
};

/** Visual breathing room between segments, in degrees of arc. */
const GAP_DEGREES = 2;

/**
 * Ring chart for the spending split.
 *
 * Drawn as one stroked circle per segment using dash offsets rather than wedge
 * paths: no arc maths, no rounding seams between neighbours, and every segment
 * shares one radius so the ring stays perfectly circular.
 */
export function DonutChart({
  segments,
  size,
  thickness = 14,
  children,
  accessibilityLabel,
}: DonutChartProps) {
  const theme = useTheme();

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = (GAP_DEGREES / 360) * circumference;

  const summary =
    accessibilityLabel ??
    segments
      .map((segment) => `${segment.label ?? segment.key} ${Math.round(segment.share * 100)}%`)
      .join(', ');

  let consumed = 0;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        {/* -90° puts the first segment at twelve o'clock. */}
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.colors.surfaceMuted}
            strokeWidth={thickness}
            fill="none"
          />

          {segments.map((segment) => {
            const length = Math.max(0, segment.share) * circumference;
            // Never let the gap eat a small segment entirely.
            const dash = Math.max(length - gap, Math.min(length, 1.5));
            const offset = -consumed;
            consumed += length;

            if (length <= 0) return null;

            return (
              <Circle
                key={segment.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={segment.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                fill="none"
              />
            );
          })}
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
