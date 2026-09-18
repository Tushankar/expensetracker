import { memo } from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Gloss } from './GlassSurface';
import { Icon, type IconName } from './Icon';

export type IconTileProps = {
  name: IconName;
  /** Accent for the glyph. The tile fill is derived from it at low opacity. */
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
};

const BOX = { sm: 36, md: 44, lg: 52 } as const;
const GLYPH = { sm: 17, md: 20, lg: 24 } as const;

/**
 * Rounded, tinted container for a category or account glyph. Used in transaction
 * rows and category lists so every row has the same visual anchor on the left.
 *
 * The fill is the accent at ~18% so tiles stay quiet next to the amount, which is
 * the thing the eye should actually land on.
 *
 * Tinted rather than blurred, deliberately: a list of forty transaction rows is
 * forty of these, and forty backdrop filters is a frame budget spent on something
 * 36 points across. It gets the light instead — a lit top edge and a diagonal
 * sweep — so it still reads as a bead of the same material.
 */
export const IconTile = memo(function IconTile({
  name,
  color,
  size = 'md',
  style,
}: IconTileProps) {
  const theme = useTheme();
  const accent = color ?? theme.colors.textSecondary;
  const box = BOX[size];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: box,
          height: box,
          borderRadius: theme.radius.sm,
          backgroundColor: withAlpha(accent, 0.18),
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Gloss radius="sm" />
      <Icon name={name} size={GLYPH[size]} color={accent} />
    </View>
  );
})

/** Accepts the `#RRGGBB` values used throughout the palette. */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return hex;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export { withAlpha };
