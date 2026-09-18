import type { BlurTint } from 'expo-blur';

import { shadeBlack, sheenWhite, withAlpha } from './alpha';
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
 *     a flat colour from the ink ramp, so the surface keeps the place in the
 *     hierarchy it had with no translucency at all.
 *
 * One thing here is worth stating plainly, because getting it wrong is the usual
 * way this effect fails: **the body of the glass is dark and only its edges are
 * white.** A white wash is the intuitive way to make a panel look frosted, and on
 * a dark app it is also the way to ruin it — white at 8% over a coloured field
 * lifts a caption to 2.9:1, well under AA, and a screen of pale grey boxes reads
 * as fog rather than as glass. So the fill is the ink ramp held back from opacity,
 * and every white in here is a highlight: the rim along the top, the shaded rim
 * along the bottom, and a diagonal sweep that resolves in the first half of the
 * face. That is where the light actually is on a piece of glass.
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
  /**
   * Translucent wash painted over the blur. This is the material's colour, and it
   * is dark — see the note at the top of this file.
   */
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
  /** How much of the body colour survives. Thicker rungs hide more. */
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
};

function build(accent: AccentSpec): GlassTokens {
  const canvas = accent.ink.canvas;
  const brand = accent.brandText;

  /**
   * One rung of the ladder.
   *
   * `body` is the colour the material is made of and `solid` is where it lands
   * when translucency is off — two separate values rather than one derived from
   * the other, because the ladder is ordered by thickness while the ink ramp is
   * ordered by lightness, and a quiet panel *inside* a card has to end up lighter
   * than the card even though it is the thinner glass of the two.
   */
  function layer(
    spec: LayerSpec,
    material: { body: string; solid: string; nativeTint?: string },
  ): GlassLayer {
    const fill = withAlpha(material.body, spec.alpha);

    return {
      blurTint: spec.blurTint,
      intensity: spec.intensity,
      blurReduction: spec.blurReduction ?? 4,
      fill,
      nativeFillScale: spec.nativeFillScale,
      opaqueFill: material.solid,
      border: sheenWhite(spec.border),
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
      nativeTint: material.nativeTint,
    };
  }

  return {
    ultraThin: layer(
      {
        blurTint: 'systemUltraThinMaterialDark',
        intensity: 22,
        // Darker and less lit than its thinness suggests, because this is the rung
        // that ends up *inside* a card carrying a corner glow — a badge or a chip
        // on top of the brightest surface the app can produce.
        alpha: 0.42,
        border: 0.09,
        highlight: 0.16,
        lowlight: 0.1,
        sheenTop: 0.035,
        sheenMid: 0.01,
        sheenBottom: 0,
        nativeStyle: 'clear',
        nativeFillScale: 0.4,
      },
      { body: accent.ink.surface, solid: accent.ink.elevated },
    ),

    thin: layer(
      {
        blurTint: 'systemThinMaterialDark',
        intensity: 32,
        alpha: 0.48,
        border: 0.11,
        highlight: 0.2,
        lowlight: 0.14,
        sheenTop: 0.06,
        sheenMid: 0.015,
        sheenBottom: 0,
        nativeStyle: 'clear',
        nativeFillScale: 0.45,
      },
      { body: accent.ink.surface, solid: accent.ink.muted },
    ),

    regular: layer(
      {
        blurTint: 'systemMaterialDark',
        intensity: 48,
        alpha: 0.6,
        border: 0.13,
        highlight: 0.26,
        lowlight: 0.18,
        sheenTop: 0.07,
        sheenMid: 0.02,
        sheenBottom: -0.05,
        nativeStyle: 'regular',
        nativeFillScale: 0.4,
      },
      { body: accent.ink.surface, solid: accent.ink.surface },
    ),

    thick: layer(
      {
        blurTint: 'systemThickMaterialDark',
        intensity: 66,
        alpha: 0.72,
        border: 0.17,
        highlight: 0.34,
        lowlight: 0.22,
        sheenTop: 0.055,
        sheenMid: 0.02,
        sheenBottom: -0.07,
        nativeStyle: 'regular',
        nativeFillScale: 0.45,
        blurReduction: 3,
      },
      { body: accent.ink.elevated, solid: accent.ink.strong },
    ),

    /**
     * Chrome carries text over whatever is scrolling beneath it, so this rung is
     * tuned for legibility first: the heaviest blur on the ladder, and a fill dark
     * enough that a caption never has to compete with a passing chart.
     */
    chrome: layer(
      {
        blurTint: 'systemChromeMaterialDark',
        intensity: 88,
        alpha: 0.84,
        border: 0.15,
        highlight: 0.3,
        lowlight: 0.24,
        sheenTop: 0.08,
        sheenMid: 0.02,
        sheenBottom: -0.06,
        nativeStyle: 'regular',
        nativeFillScale: 0.5,
        blurReduction: 2.5,
      },
      { body: accent.ink.elevated, solid: accent.ink.elevated },
    ),

    /**
     * The one rung whose body is lighter than the canvas rather than darker, since
     * the accent *is* the message on a selected chip or an offered card.
     *
     * Which is why almost all of that accent is in the rim rather than the fill.
     * The text on a brand surface is `brandText` — the same hue as the tint — so
     * every point of alpha in the fill is taken directly out of the contrast
     * between them. A bright accent edge says "selected" just as loudly and costs
     * the caption inside nothing.
     */
    brand: layer(
      {
        blurTint: 'systemThinMaterialDark',
        intensity: 44,
        alpha: 0.05,
        border: 0.55,
        highlight: 0.28,
        lowlight: 0.14,
        sheenTop: 0.02,
        sheenMid: 0.008,
        sheenBottom: 0,
        nativeStyle: 'regular',
        nativeFillScale: 0.65,
      },
      {
        body: brand,
        solid: accent.brandSurface,
        nativeTint: withAlpha(brand, 0.28),
      },
    ),

    hero: layer(
      {
        blurTint: 'systemThickMaterialDark',
        intensity: 60,
        alpha: 0.55,
        border: 0.22,
        highlight: 0.32,
        lowlight: 0.26,
        sheenTop: 0.13,
        sheenMid: 0.03,
        sheenBottom: -0.1,
        nativeStyle: 'regular',
        nativeFillScale: 0.75,
      },
      {
        body: accent.heroTile,
        solid: accent.heroSurface,
        nativeTint: withAlpha(brand, 0.22),
      },
    ),

    // Kept deliberately faint. These are the only thing the glass has to refract,
    // so they have to be *there* — and they are also the only thing that can push
    // a caption on a pale rung under AA, so they cannot be there by much. The
    // numbers come from measuring the worst case: the brightest point of a bloom,
    // under the thickest rung, on the platform whose fallback lightens rather than
    // darkens.
    aurora: [
      { color: accent.brand, opacity: 0.22 },
      { color: brand, opacity: 0.16 },
      { color: categoryHues.transport, opacity: 0.11 },
      { color: accent.heroSurface, opacity: 0.34 },
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
