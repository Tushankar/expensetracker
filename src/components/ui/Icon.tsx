import { memo } from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { iconRegistry, type IconName } from '@/components/icons/registry';
import { useTheme } from '@/theme';

export type IconProps = {
  name: IconName;
  /** Rendered box, in dp. Defaults to 22 — the app's standard inline icon size. */
  size?: number;
  /** Defaults to the primary text colour so icons match the text they sit beside. */
  color?: string;
  /** Override the computed stroke. Only needed for deliberately bold or hairline icons. */
  strokeWidth?: number;
  /**
   * Supply this only when the icon carries meaning on its own. Icons next to a
   * visible label are decorative and must stay hidden from screen readers, which
   * is the default.
   */
  accessibilityLabel?: string;
  opacity?: number;
};

/**
 * Stroke weight is specified in viewBox units, so a naive constant would render
 * thin at 16dp and heavy at 44dp. Damping the scale keeps the optical weight
 * near-constant across the sizes the app actually uses.
 */
function strokeForSize(size: number): number {
  return 2 * (24 / size) ** 0.6;
}

function IconComponent({
  name,
  size = 22,
  color,
  strokeWidth,
  accessibilityLabel,
  opacity,
}: IconProps) {
  const { colors } = useTheme();
  const shapes = iconRegistry[name];
  const stroke = color ?? colors.textPrimary;
  const width = strokeWidth ?? strokeForSize(size);
  const decorative = !accessibilityLabel;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      opacity={opacity}
      accessible={!decorative}
      accessibilityRole={decorative ? 'none' : 'image'}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    >
      <G
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {shapes.map((shape, index) => {
          const key = `${name}-${index}`;
          if (shape.t === 'path') return <Path key={key} d={shape.d} />;
          if (shape.t === 'circle') {
            return <Circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} />;
          }
          return (
            <Rect
              key={key}
              x={shape.x}
              y={shape.y}
              width={shape.w}
              height={shape.h}
              rx={shape.rx}
            />
          );
        })}
      </G>
    </Svg>
  );
}

/** Icons re-render on every parent render otherwise, and lists are full of them. */
export const Icon = memo(IconComponent);

export type { IconName };
