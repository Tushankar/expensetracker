import {
  accents,
  actionHues,
  amber,
  blue,
  categoryHues,
  merchantTints,
  money,
  type AccentId,
  type AccentSpec,
  type ActionHue,
  type CategoryHue,
} from './palette';

/**
 * Semantic colour tokens. Every component reads from this shape, never from the
 * raw palette, so swapping the accent recolours the whole app at once.
 */
export type ColorTokens = {
  background: string;
  /** Raised surfaces: cards, sheets, the tab bar. */
  surface: string;
  /** A card nested inside a card. */
  surfaceElevated: string;
  /** Quiet fills: icon tiles, inert chips, input backgrounds. */
  surfaceMuted: string;
  /** Pressed states and progress tracks. */
  surfaceStrong: string;

  border: string;
  borderStrong: string;
  divider: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  /** Text that sits on a `brand` fill. */
  textOnAccent: string;

  brand: string;
  brandPressed: string;
  brandSurface: string;
  /** Brand as text or an icon on a dark surface. */
  brandText: string;
  brandGlow: string;

  /** High-contrast neutral fill for primary actions. */
  inverse: string;
  inversePressed: string;

  positive: string;
  positiveSurface: string;
  negative: string;
  negativeSurface: string;
  warning: string;
  warningSurface: string;
  info: string;
  infoSurface: string;

  /** The balance card. Anything inside it reads from these, not from `surface`. */
  heroSurface: string;
  heroSurfaceEnd: string;
  heroBorder: string;
  heroText: string;
  heroTextMuted: string;
  heroTile: string;
  heroTileBorder: string;
  heroPositive: string;
  heroNegative: string;

  overlay: string;
  skeleton: string;
  skeletonHighlight: string;
  ripple: string;
  focusRing: string;
};

function build(accent: AccentSpec): ColorTokens {
  return {
    background: accent.ink.canvas,
    surface: accent.ink.surface,
    surfaceElevated: accent.ink.elevated,
    surfaceMuted: accent.ink.muted,
    surfaceStrong: accent.ink.strong,

    border: accent.ink.strong,
    borderStrong: accent.ink.border,
    divider: accent.ink.muted,

    textPrimary: '#FFFFFF',
    textSecondary: accent.textSecondary,
    textTertiary: accent.textTertiary,
    textOnAccent: accent.textOnAccent,

    brand: accent.brand,
    brandPressed: accent.brandPressed,
    brandSurface: accent.brandSurface,
    brandText: accent.brandText,
    brandGlow: accent.brandGlow,

    inverse: '#FFFFFF',
    inversePressed: '#DCD7EC',

    positive: money.in,
    positiveSurface: money.inSurface,
    negative: money.out,
    negativeSurface: money.outSurface,
    warning: amber.base,
    warningSurface: amber.surface,
    info: blue.base,
    infoSurface: blue.surface,

    heroSurface: accent.heroSurface,
    heroSurfaceEnd: accent.heroSurfaceEnd,
    heroBorder: accent.heroBorder,
    heroText: '#FFFFFF',
    heroTextMuted: accent.heroTextMuted,
    heroTile: accent.heroTile,
    heroTileBorder: 'rgba(255, 255, 255, 0.08)',
    heroPositive: money.in,
    heroNegative: money.out,

    overlay: 'rgba(3, 2, 6, 0.72)',
    skeleton: accent.ink.muted,
    skeletonHighlight: accent.ink.strong,
    ripple: 'rgba(255, 255, 255, 0.06)',
    focusRing: accent.brandText,
  };
}

export const colorsByAccent: Record<AccentId, ColorTokens> = {
  violet: build(accents.violet),
  green: build(accents.green),
  red: build(accents.red),
};

/**
 * Resolve a spending category's accent. Shared across every theme.
 *
 * Takes a plain string as well as a known hue, because category colours are stored
 * on the server: a category created by a newer client can name a hue this build
 * has never heard of, and a chart band with no colour is worse than a grey one.
 */
export function categoryColor(hue: CategoryHue | string): string {
  return categoryHues[hue as CategoryHue] ?? categoryHues.other;
}

/** Resolve a quick-action tile's fill and the mark that sits on it. */
export function actionStyle(hue: ActionHue): { fill: string; glyph: 'dark' | 'light' } {
  return actionHues[hue] ?? { fill: categoryHues.other, glyph: 'light' };
}

/**
 * Deterministic monogram tint for a merchant, so the same shop is always the same
 * colour in a list without shipping anyone's logo.
 */
export function merchantTint(name: string): { fill: string; text: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return merchantTints[hash % merchantTints.length] ?? { fill: '#6E6690', text: '#FFFFFF' };
}

export type { ActionHue, CategoryHue };
