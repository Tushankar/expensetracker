import { useMemo } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

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
 * The trend line behind the balance. Decorative: it sets the mood of the card and
 * carries no labels, so it is hidden from screen readers and the figures beside it
 * do the informing.
 *
 * Smoothed with a horizontal-tangent cubic through each pair of points, which keeps
 * the curve from overshooting the way a Catmull-Rom spline does on spiky data.
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
          <Stop offset="0" stopColor={color} stopOpacity={0.28} />
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
    </Svg>
  );
}
