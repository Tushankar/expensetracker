import { shadeBlack, sheenWhite, withAlpha } from './alpha';
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
 *
 * Every surface and every edge in here is translucent. That is the single change
 * that made the glass go all the way down: a component that writes
 * `backgroundColor: colors.surfaceMuted` is now painting a pane of tinted glass
 * over the ambient colour field, without knowing anything about it. Anything that
 * wants the full material — a real backdrop blur, a sheen, a lit rim — reaches for
 * `GlassSurface` instead, and the two agree because the alphas were chosen
 * together.
 *
 * The one token that stays opaque is `background`. It is the bottom of the stack,
 * and something has to be.
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

    // The ink ramp, held back from opacity. Each one keeps the hue and the
    // lightness it always had — which is what keeps body text and captions
    // reading exactly as they did — and lets the field behind it through.
    // A muted panel is the most transparent of the four because it is almost
    // always sitting inside something that is already tinted.
    surface: withAlpha(accent.ink.surface, 0.82),
    surfaceElevated: withAlpha(accent.ink.elevated, 0.85),
    surfaceMuted: withAlpha(accent.ink.muted, 0.62),
    surfaceStrong: withAlpha(accent.ink.strong, 0.78),

    // Edges are white rather than a lighter grey. On a translucent surface a
    // grey border has to compete with whatever is showing through, while a
    // white one always reads as the lit edge of the pane.
    border: sheenWhite(0.12),
    borderStrong: sheenWhite(0.2),
    divider: sheenWhite(0.07),

    textPrimary: '#FFFFFF',
    textSecondary: accent.textSecondary,
    textTertiary: accent.textTertiary,
    textOnAccent: accent.textOnAccent,

    brand: accent.brand,
    brandPressed: accent.brandPressed,
    // Accent glass: the brand colour itself at low alpha, rather than a dark
    // slab pre-mixed with it, so it picks up whatever it is laid over.
    brandSurface: withAlpha(accent.brandText, 0.16),
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
    // A tile on the hero slab is glass on glass, so it is a wash rather than its
    // own colour — a second saturated fill there only muddies the one underneath.
    // It washes *down*: the slab is the brightest surface in the app and it
    // carries a glow, so a white tile on it left quiet text at 3.5:1. Recessed
    // rather than raised, with the white kept where it belongs, on the rim.
    heroTile: shadeBlack(0.18),
    heroTileBorder: sheenWhite(0.16),
    heroPositive: money.in,
    heroNegative: money.out,

    overlay: withAlpha(accent.ink.canvas, 0.72),
    skeleton: withAlpha(accent.ink.muted, 0.6),
    skeletonHighlight: sheenWhite(0.08),
    ripple: sheenWhite(0.06),
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
