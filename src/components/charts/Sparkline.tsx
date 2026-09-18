import { useMemo } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

export type SparklineProps = {
  /** Raw series, any scale. At least two points. */
  data: readonly number[];
  width: number;
  height: number;
  color: string;
  /** Fill the area under the line with a fade to transparent. */
  filled?: boolean;
  strokeWidth?: number;
  /** Unique within a screen — SVG gradient ids are global to the document. */
  gradientId?: string;
};

/**
 * Where the highlight sits relative to the line, in points.
 *
 * Above it, at a low alpha: the same lit top edge every glass surface in the app
 * carries, following a curve instead of a rectangle.
 */
const HIGHLIGHT_OFFSET = -1.5;

/**
 * The trend line behind the balance. Decorative: it sets the mood of the card and
 * carries no labels, so it is hidden from screen readers and the figures beside it
 * do the informing.
 *
 * Smoothed with a horizontal-tangent cubic through each pair of points, which keeps
 * the curve from overshooting the way a Catmull-Rom spline does on spiky data.
 *
 * The fill under it is graded in three stops rather than two, so it reads as a
 * wedge of tinted glass resting on the card rather than as a colour fading out.
 */
export function Sparkline({
  data,
  width,
  height,
  color,
  filled = true,
  strokeWidth = 2,
  gradientId = 'sparkline',
}: SparklineProps) {
  const theme = useTheme();

  const { line, area } = useMemo(() => {
    if (data.length < 2) return { line: '', area: '' };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;

    // Inset vertically so the stroke is never clipped by the viewBox.
    const pad = strokeWidth;
    const points = data.map((value, index) => ({
      x: (index / (data.length - 1)) * width,
      y: pad + (1 - (value - min) / span) * (height - pad * 2),
    }));

    const first = points[0];
    if (!first) return { line: '', area: '' };

    let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      if (!prev || !curr) continue;
      const midX = (prev.x + curr.x) / 2;
      d += ` C ${midX.toFixed(2)} ${prev.y.toFixed(2)}, ${midX.toFixed(2)} ${curr.y.toFixed(
        2,
      )}, ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
    }

    const last = points[points.length - 1];
    const closed = last ? `${d} L ${last.x.toFixed(2)} ${height} L 0 ${height} Z` : d;

    return { line: d, area: closed };
  }, [data, height, strokeWidth, width]);

  if (!line) return null;

  return (
    <Svg
      width={width}
      height={height}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.34} />
          {/* The mid stop is what gives the fill a body. Two stops fade evenly
              and read as a gradient; three hold their colour near the line and
              then let go, which is how a translucent solid behaves. */}
          <Stop offset="0.45" stopColor={color} stopOpacity={0.12} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {filled ? <Path d={area} fill={`url(#${gradientId})`} /> : null}
      <Path
        d={line}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d={line}
        stroke={theme.glass.regular.highlight}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        translateY={HIGHLIGHT_OFFSET}
      />
    </Svg>
  );
}
