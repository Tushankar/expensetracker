import { colorsByAccent, type ColorTokens } from './colors';
import { glassByAccent, type GlassTokens } from './glass';
import { duration, easing, pressScale, spring } from './motion';
import { accents, type AccentId } from './palette';
import { radius } from './radius';
import { shadows, type Shadows } from './shadows';
import { layout, spacing } from './spacing';
import { fontFamily, typeScale } from './typography';

/** The single object every component receives from `useTheme()`. */
export type Theme = {
  /** Which accent is active. Components should not branch on this — use tokens. */
  accent: AccentId;
  accentLabel: string;
  colors: ColorTokens;
  /** Liquid-glass materials. Read by `GlassSurface`, rarely by anything else. */
  glass: GlassTokens;
  shadows: Shadows;
  spacing: typeof spacing;
  layout: typeof layout;
  radius: typeof radius;
  type: typeof typeScale;
  fontFamily: typeof fontFamily;
  duration: typeof duration;
  easing: typeof easing;
  spring: typeof spring;
  pressScale: typeof pressScale;
};

const shared = {
  shadows,
  spacing,
  layout,
  radius,
  type: typeScale,
  fontFamily,
  duration,
  easing,
  spring,
  pressScale,
} as const;

function make(accent: AccentId): Theme {
  return {
    accent,
    accentLabel: accents[accent].label,
    colors: colorsByAccent[accent],
    glass: glassByAccent[accent],
    ...shared,
  };
}

export const themes: Record<AccentId, Theme> = {
  violet: make('violet'),
  green: make('green'),
  red: make('red'),
};

export const defaultTheme = themes.violet;
