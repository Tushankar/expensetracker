import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';

import { GlassSurface } from '@/components/ui';
import { useTheme, type GlassTone } from '@/theme';

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
  /**
   * Grades each arc from its own colour into a deeper tone of it. Flat arcs read
   * as a chart; graded ones read as a dial, which is what this is being used as.
   */
  gradient?: boolean;
  /** Rounds the ends of every arc. See the note on `capLoss` below. */
  rounded?: boolean;
  /** Rendered in the hole — usually a total and a caption. */
  children?: ReactNode;
  /**
   * Material for the disc behind that hole. `none` leaves it open.
   *
   * A ring drawn straight onto the ambient field has a window in the middle of it,
   * and a total sitting in that window has nothing to sit on. The disc gives the
   * figure a surface and makes the ring read as a dial cut into glass.
   */
  centerTone?: GlassTone | 'none';
  accessibilityLabel?: string;
  /** Unique within a screen — SVG gradient ids are document-global. */
  gradientId?: string;
};

/** Visual breathing room between segments, in degrees of arc. */
const GAP_DEGREES = 2;

/**
 * Ring chart for the spending split.
 *
 * Drawn as one stroked circle per segment using dash offsets rather than wedge
 * paths: no arc maths, no rounding seams between neighbours, and every segment
 * shares one radius so the ring stays perfectly circular.
 *
 * The ring itself is glass: a translucent track, a lit hairline along its outer
 * edge and a fainter one along the inner, and a disc of the same material filling
 * the hole. Those two hairlines are what turn a flat band of colour into a tube
 * with a thickness — the same trick every other surface in the app uses along its
 * top edge, bent into a circle.
 */
export function DonutChart({
  segments,
  size,
  thickness = 14,
  gradient = false,
  rounded = false,
  children,
  centerTone = 'thin',
  accessibilityLabel,
  gradientId = 'donut',
}: DonutChartProps) {
  const theme = useTheme();

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = (GAP_DEGREES / 360) * circumference;

  // Half a point inside each face of the band, so the hairline sits on the edge
  // rather than straddling it and going soft.
  const outerEdge = radius + thickness / 2 - 0.5;
  const innerEdge = radius - thickness / 2 + 0.5;
  const holeSize = Math.max(0, (radius - thickness / 2) * 2);

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
      {centerTone === 'none' || holeSize <= 0 ? null : (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.noTouch]}>
          <GlassSurface
            tone={centerTone}
            radius={holeSize / 2}
            sheen={false}
            // The ring already draws a hairline along its inner edge, which is
            // exactly where this disc ends. A second one would double it.
            rim={false}
            style={{ width: holeSize, height: holeSize }}
          />
        </View>
      )}

      <Svg width={size} height={size}>
        {gradient ? (
          <Defs>
            {segments.map((segment, index) => (
              <LinearGradient
                key={`donut-grad-${segment.key || segment.label || index}-${index}`}
                id={`${gradientId}-${segment.key}`}
                x1="0"
                y1="0"
                x2="1"
                y2="1"
              >
                <Stop offset="0" stopColor={segment.color} stopOpacity={1} />
                {/* Dimmed rather than darkened: there is no colour-mixing helper
                    here, and over a near-black card a lowered alpha of the same
                    hue is the deeper tone of it. */}
                <Stop offset="1" stopColor={segment.color} stopOpacity={0.55} />
              </LinearGradient>
            ))}
          </Defs>
        ) : null}

        {/* -90° puts the first segment at twelve o'clock. */}
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.glass.thin.fill}
            strokeWidth={thickness}
            fill="none"
          />

          {segments.map((segment, index) => {
            const length = Math.max(0, segment.share) * circumference;
            const start = consumed;
            consumed += length;

            if (length <= 0) return null;

            /**
             * The arc this segment may occupy: its own share, less the separator.
             * Everything below has to fit inside it exactly, because a segment that
             * draws past its slot runs over its neighbour — and the last one wraps
             * around to overlap the first, which is precisely the seam this used to
             * show at twelve o'clock.
             */
            const available = Math.max(0, length - gap);

            /**
             * A round cap is a half-disc of the stroke's own width hanging off each
             * end of the dash, so a rounded arc always draws one full stroke width
             * longer than its dash. A segment narrower than the stroke therefore
             * cannot carry full-width caps at all — so it keeps the round shape and
             * gives up width instead, becoming a smaller dot centred on the same
             * radius. Thinner than the ring, but never longer than its share.
             */
            const width = rounded ? Math.min(thickness, available) : thickness;
            const dash = rounded
              ? Math.max(available - width, 0.01)
              : // A butt-capped sliver still needs a hair of length to render.
                Math.max(available, 0.5);
            // Round caps grow from the dash's ends, so the dash starts half a
            // width in for the arc to still begin where the share does.
            const offset = -start - (rounded ? width / 2 : 0);

            return (
              <Circle
                key={`donut-arc-${segment.key || segment.label || index}-${index}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={gradient ? `url(#${gradientId}-${segment.key})` : segment.color}
                strokeWidth={width}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                strokeLinecap={rounded ? 'round' : 'butt'}
                fill="none"
              />
            );
          })}

          {/* The two edges of the tube. Drawn last so they read on top of every
              segment, and outside the rotated group would land in the same place
              anyway — they are concentric. */}
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
        <View style={[StyleSheet.absoluteFill, styles.center, styles.noTouch]}>{children}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  noTouch: { pointerEvents: 'none' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
