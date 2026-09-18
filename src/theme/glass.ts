import type { BlurTint } from 'expo-blur';

import { flatten, shadeBlack, sheenWhite, withAlpha } from './alpha';
import { accents, categoryHues, type AccentId, type AccentSpec } from './palette';

/**
 * Liquid glass tokens.
 *
 * Glass in this app is not a single material — it is a five-step ladder of
 * thickness plus two tinted members, and every surface picks the rung that matches
 * how much it needs to separate from what is behind it. A card floating over the
 * canvas wants `regular`; the tab bar, which has a whole scrolling screen sliding
 * under it, wants `chrome`.
 *
 * Each rung is described three times over, because the same design has to survive
 * three very different renderers:
 *
 *   - iOS 26 draws real Liquid Glass (`expo-glass-effect`), which brings its own
 *     material, refraction and specular edge. Our own layers step back to a whisper
 *     there — `nativeFillScale` — so we tint that material instead of burying it.
 *   - Everything else with a backdrop filter (iOS 13–25, web, Android 31+ with a
 *     blur target) gets `expo-blur` plus our own tint, sheen and rim.
 *   - Anything left over — old Android, Reduce Transparency — gets `opaqueFill`,
 *     which is the glass fill already composited over the ink ramp by hand, so
 *     the surface keeps its exact colour with no translucency at all.
 */

export type GlassTone =
  /** Barely there. Chips, badges, inert pills — things that label rather than hold. */
  | 'ultraThin'
  /** Nested panels inside a glass card, input fields, chart tracks. */
  | 'thin'
  /** The default. Cards, tiles, anything that holds content on the canvas. */
  | 'regular'
  /** Raised controls: a segmented thumb, a floating action, a toast. */
  | 'thick'
  /** Navigation chrome with live content sliding under it: tab bar, sheets, headers. */
  | 'chrome'
  /** Accent-tinted glass for selected and brand-owned surfaces. */
  | 'brand'
  /** The balance slab — deep, saturated, the one surface allowed to shout. */
  | 'hero';

export type GlassLayer = {
  /** `expo-blur` material. */
  blurTint: BlurTint;
  /** `expo-blur` intensity, 1–100. */
  intensity: number;
  /** Android divisor that brings the perceived blur back in line with iOS. */
  blurReduction: number;
  /** Translucent wash painted over the blur. This is the material's colour. */
  fill: string;
  /** How much of `fill` survives on top of real iOS 26 Liquid Glass. */
  nativeFillScale: number;
  /** Solid stand-in for Reduce Transparency and pre-31 Android. */
  opaqueFill: string;
  /** Hairline rim around the whole shape. */
  border: string;
  /** Brighter top edge — reads as a light source above the slab. */
  highlight: string;
  /** Darker bottom edge, so the slab has a thickness rather than just a colour. */
  lowlight: string;
  /** Diagonal specular sweep across the face, top-left to bottom-right. */
  sheen: readonly [string, string, string];
  /** Where those three stops land. */
  sheenLocations: readonly [number, number, number];
  /** iOS 26 material. `clear` refracts more and tints less. */
  nativeStyle: 'clear' | 'regular';
  /** iOS 26 tint. Undefined leaves the system material untinted. */
  nativeTint?: string;
};

/** How hard the light falls on a solid surface. */
export type GlossStrength =
  /** Tinted fills and tiles — present, but it never draws the eye. */
  | 'soft'
  /** The primary action. Wet-looking, and meant to be. */
  | 'bright';

export type Gloss = {
  colors: readonly [string, string, string];
  locations: readonly [number, number, number];
  border: string;
  highlight: string;
};

export type GlassTokens = Record<GlassTone, GlassLayer> & {
  /**
   * The colour field that lives behind everything.
   *
   * Glass is a lens, and a lens over a flat black screen renders as flat black
   * glass — which is to say, as nothing. These blooms are what the whole effect is
   * actually refracting, so they are a load-bearing part of the design rather than
   * decoration.
   */
  aurora: readonly { color: string; opacity: number }[];
  /**
   * Optics without translucency, for the surfaces that have to stay solid.
   *
   * A primary button, the add action, a saturated category tile — these need full
   * contrast, so they cannot be see-through. What they can still have is the way
   * light behaves on glass: a lit top edge, a diagonal sweep across the face and a
   * shaded underside. That is enough to turn a flat rectangle of colour into a
   * piece of the same material as everything around it.
   */
  gloss: Record<GlossStrength, Gloss>;
  /** Scrim behind a modal. Darker and less saturated than the canvas. */
  scrim: string;
  /** Blur intensity for that scrim. */
  scrimIntensity: number;
  /** Pressed-state wash, laid over any tone. */
  pressed: string;
  /** Focus/selection rim for glass controls. */
  activeBorder: string;
};

type LayerSpec = {
  blurTint: BlurTint;
  intensity: number;
  alpha: number;
  border: number;
  highlight: number;
  lowlight: number;
  sheenTop: number;
  sheenMid: number;
  /** Negative values shade the bottom of the sweep instead of lighting it. */
  sheenBottom: number;
  nativeStyle: 'clear' | 'regular';
  nativeFillScale: number;
  blurReduction?: number;
  /**
   * What the solid fallback composites against. Defaults to the card colour
   * from the ink ramp, so a surface with translucency switched off lands on the
   * accent's own grey rather than on a neutral one.
   */
  base?: string;
};

function build(accent: AccentSpec): GlassTokens {
  const canvas = accent.ink.canvas;
  const brand = accent.brandText;

  /** One rung of the ladder. The wash is white unless a tint is given. */
  function layer(spec: LayerSpec, wash?: { color: string; nativeTint?: string }): GlassLayer {
    const fill = wash ? withAlpha(wash.color, spec.alpha) : sheenWhite(spec.alpha);

    return {
      blurTint: spec.blurTint,
      intensity: spec.intensity,
      blurReduction: spec.blurReduction ?? 4,
      fill,
      nativeFillScale: spec.nativeFillScale,
      // Composited by hand rather than guessed at, so turning translucency off
      // changes how the surface is drawn and not what colour it is.
      opaqueFill: flatten(fill, spec.base ?? accent.ink.surface),
      border: wash ? withAlpha(wash.color, spec.border) : sheenWhite(spec.border),
      highlight: sheenWhite(spec.highlight),
      lowlight: shadeBlack(spec.lowlight),
      sheen: [
        sheenWhite(spec.sheenTop),
        sheenWhite(spec.sheenMid),
        spec.sheenBottom >= 0 ? sheenWhite(spec.sheenBottom) : shadeBlack(-spec.sheenBottom),
      ],
      // The sweep resolves early: a highlight that runs the full diagonal looks
      // like a gradient, one that stops around 45% looks like light on a surface.
      sheenLocations: [0, 0.45, 1],
      nativeStyle: spec.nativeStyle,
      nativeTint: wash?.nativeTint,
    };
  }

  return {
    ultraThin: layer({
      blurTint: 'systemUltraThinMaterialDark',
      intensity: 22,
      alpha: 0.05,
      border: 0.08,
      highlight: 0.14,
      lowlight: 0.1,
      sheenTop: 0.07,
      sheenMid: 0.015,
      sheenBottom: 0,
      nativeStyle: 'clear',
      nativeFillScale: 0.4,
    }),

    thin: layer({
      blurTint: 'systemThinMaterialDark',
      intensity: 32,
      alpha: 0.07,
      border: 0.1,
      highlight: 0.18,
      lowlight: 0.14,
      sheenTop: 0.09,
      sheenMid: 0.02,
      sheenBottom: 0,
      nativeStyle: 'clear',
      nativeFillScale: 0.45,
    }),

    regular: layer({
      blurTint: 'systemMaterialDark',
      intensity: 48,
      alpha: 0.085,
      border: 0.12,
      highlight: 0.24,
      lowlight: 0.18,
      sheenTop: 0.12,
      sheenMid: 0.025,
      sheenBottom: -0.05,
      nativeStyle: 'regular',
      nativeFillScale: 0.4,
    }),

    thick: layer({
      blurTint: 'systemThickMaterialDark',
      intensity: 66,
      alpha: 0.12,
      border: 0.16,
      highlight: 0.32,
      lowlight: 0.22,
      sheenTop: 0.16,
      sheenMid: 0.04,
      sheenBottom: -0.07,
      nativeStyle: 'regular',
      nativeFillScale: 0.45,
      blurReduction: 3,
      base: accent.ink.elevated,
    }),

    /**
     * Chrome carries text over whatever is scrolling beneath it, so this rung is
     * tuned for legibility first: the heaviest blur on the ladder, and a fill dark
     * enough that a caption never has to compete with a passing chart.
     */
    chrome: layer({
      blurTint: 'systemChromeMaterialDark',
      intensity: 88,
      alpha: 0.1,
      border: 0.14,
      highlight: 0.28,
      lowlight: 0.24,
      sheenTop: 0.13,
      sheenMid: 0.03,
      sheenBottom: -0.06,
      nativeStyle: 'regular',
      nativeFillScale: 0.5,
      blurReduction: 2.5,
      base: accent.ink.elevated,
    }),

    brand: layer(
      {
        blurTint: 'systemThinMaterialDark',
        intensity: 44,
        alpha: 0.2,
        border: 0.34,
        highlight: 0.26,
        lowlight: 0.14,
        sheenTop: 0.14,
        sheenMid: 0.03,
        sheenBottom: 0,
        nativeStyle: 'regular',
        nativeFillScale: 0.65,
      },
      { color: brand, nativeTint: withAlpha(brand, 0.28) },
    ),

    hero: layer(
      {
        blurTint: 'systemThickMaterialDark',
        intensity: 60,
        alpha: 0.26,
        border: 0.26,
        highlight: 0.3,
        lowlight: 0.26,
        sheenTop: 0.18,
        sheenMid: 0.04,
        sheenBottom: -0.1,
        nativeStyle: 'regular',
        nativeFillScale: 0.75,
        base: accent.heroSurface,
      },
      { color: accent.heroTile, nativeTint: withAlpha(brand, 0.22) },
    ),

    aurora: [
      { color: accent.brand, opacity: 0.4 },
      { color: brand, opacity: 0.26 },
      { color: categoryHues.transport, opacity: 0.16 },
      { color: accent.heroSurface, opacity: 0.55 },
    ],

    gloss: {
      soft: {
        colors: [sheenWhite(0.16), sheenWhite(0.03), shadeBlack(0.1)],
        locations: [0, 0.5, 1],
        border: sheenWhite(0.1),
        highlight: sheenWhite(0.24),
      },
      bright: {
        colors: [sheenWhite(0.34), sheenWhite(0.06), shadeBlack(0.16)],
        locations: [0, 0.48, 1],
        border: sheenWhite(0.16),
        highlight: sheenWhite(0.45),
      },
    },

    scrim: withAlpha(canvas, 0.58),
    scrimIntensity: 34,
    pressed: sheenWhite(0.09),
    activeBorder: withAlpha(brand, 0.55),
  };
}

export const glassByAccent: Record<AccentId, GlassTokens> = {
  violet: build(accents.violet),
  green: build(accents.green),
  red: build(accents.red),
};
