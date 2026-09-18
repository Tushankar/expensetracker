import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import {
  useTheme,
  withAlpha,
  type GlassTone,
  type GlossStrength,
  type Radius,
  type ShadowLevel,
} from '@/theme';

/**
 * How glass is going to be drawn on this device, right now.
 *
 *   - `native`  — iOS 26 Liquid Glass, via `expo-glass-effect`.
 *   - `blur`    — a real backdrop filter, via `expo-blur`.
 *   - `opaque`  — no translucency at all: Reduce Transparency is on, or the
 *                 platform cannot blur a backdrop cheaply enough to be worth it.
 */
export type GlassMode = 'native' | 'blur' | 'opaque';

/**
 * Every glass layer, everywhere in this file: full-bleed and untouchable.
 *
 * `pointerEvents` lives in the style rather than in a prop because half of these
 * layers are native or third-party views, where only the style form is guaranteed
 * to be applied.
 */
const layerStyle: ViewStyle = { ...StyleSheet.absoluteFill, pointerEvents: 'none' };

/**
 * Whether iOS 26 Liquid Glass is available. Resolved once, and defensively.
 *
 * The check reaches into a native module, which means a dev client or a store
 * build made before `expo-glass-effect` was added throws instead of answering.
 * The correct answer in that case is simply no, and the app then renders the
 * backdrop-blur path it would have used on any earlier iOS.
 */
const LIQUID_GLASS = (() => {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

type GlassContextValue = {
  /**
   * The view Android is to blur.
   *
   * Android blurs a *target view*, not whatever happens to be underneath, so every
   * glass surface needs a handle on the thing it is meant to be refracting. Without
   * one, `expo-blur` warns and silently degrades, so we check before ever asking
   * for a blur method. `null` means there is nothing samplable from here.
   */
  target: RefObject<View | null> | null;
  /** The OS has been asked for solid backgrounds. Nothing may be see-through. */
  reduceTransparency: boolean;
};

const GlassContext = createContext<GlassContextValue>({
  target: null,
  reduceTransparency: false,
});

export function useGlassContext(): GlassContextValue {
  return useContext(GlassContext);
}

export function useGlassBackdrop(): RefObject<View | null> | null {
  return useGlassContext().target;
}

/**
 * Publishes the blur target and watches Reduce Transparency, once, for the whole
 * app.
 *
 * Both of those belong to the app rather than to a surface, and the subscription
 * in particular has to live here: a screen can hold forty pieces of glass, and
 * forty listeners on the same accessibility flag is forty native round trips to
 * learn the same thing.
 */
export function GlassProvider({
  target,
  children,
}: {
  target: RefObject<View | null> | null;
  children: ReactNode;
}) {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (active) setReduceTransparency(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (enabled) => setReduceTransparency(enabled),
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const value = useMemo(() => ({ target, reduceTransparency }), [target, reduceTransparency]);

  return <GlassContext.Provider value={value}>{children}</GlassContext.Provider>;
}

/**
 * Swaps out the blur target for a subtree, keeping everything else.
 *
 * A modal is its own native window on Android, and a blur cannot reach across into
 * the window it is sitting on top of — so the sheet passes `null` there and every
 * surface inside it falls back to a solid fill.
 */
export function GlassTargetOverride({
  target,
  children,
}: {
  target: RefObject<View | null> | null;
  children: ReactNode;
}) {
  const parent = useGlassContext();
  const value = useMemo(() => ({ ...parent, target }), [parent, target]);

  return <GlassContext.Provider value={value}>{children}</GlassContext.Provider>;
}

/** How glass will be drawn here, given the platform and the accessibility flags. */
export function useGlassMode(): GlassMode {
  const { target: backdrop, reduceTransparency } = useGlassContext();

  if (reduceTransparency) return 'opaque';
  if (LIQUID_GLASS) return 'native';

  // Android below 31 has no cheap backdrop blur, and `expo-blur` there renders a
  // flat translucent panel anyway — which is exactly what `opaque` already does,
  // only without a native view in the tree for every card on the screen.
  if (Platform.OS === 'android' && (Platform.Version as number) < 31) return 'opaque';
  if (Platform.OS === 'android' && !backdrop) return 'opaque';

  return 'blur';
}

export type GlassSurfaceProps = {
  children?: ReactNode;
  /**
   * Rendered underneath the material, full-bleed.
   *
   * For the corner glows several cards carry. Behind the glass they read as a
   * light source the material is diffusing, which is both the truer effect and
   * the safe one: the fill attenuates them, where the same glow painted over the
   * top adds its whole luminance to the text on that card.
   */
  backdrop?: ReactNode;
  /** Which rung of the material ladder. See `GlassTone`. */
  tone?: GlassTone;
  radius?: Radius | number;
  /**
   * Per-corner override. Needed by the surfaces that are only round on one side —
   * the tab bar and the bottom sheet — because the rim has to be shaped the same
   * way the shell is, or the hairline peels away from the edge it belongs to.
   */
  corners?: {
    topLeft?: number;
    topRight?: number;
    bottomLeft?: number;
    bottomRight?: number;
  };
  /** Inner padding. Kept as a prop so the glass layers are never inset by it. */
  padding?: number;
  shadow?: ShadowLevel;
  /** The diagonal specular sweep. Off for very small or very dense surfaces. */
  sheen?: boolean;
  /** The hairline rim. Off when a parent already draws the edge. */
  rim?: boolean;
  /** Overrides the rim colour — for selected and focused states. */
  rimColor?: string;
  /** Extra colour wash over the material, on top of the tone's own fill. */
  tint?: string;
  /**
   * iOS 26 only: lets the glass bulge and scatter light under a finger. Reserve it
   * for things that are actually pressed, or the whole screen starts squirming.
   */
  interactive?: boolean;
  /**
   * Force the expensive Android blur path on or off. Defaults to on for `chrome`,
   * which is the only tone with live content sliding under it, and off elsewhere —
   * a screen of individually blurring cards costs far more than it shows.
   */
  backdropBlur?: boolean;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: ViewStyle['pointerEvents'];
  testID?: string;
};

/**
 * The single piece of glass every other surface in the app is cut from.
 *
 * Five layers, bottom to top: the backdrop filter, a tint wash that gives the
 * material its colour, a diagonal sheen that reads as light falling across it, a
 * hairline rim lit along the top edge and shaded along the bottom, and finally the
 * content. Take any one of them away and it stops looking like glass — the blur
 * alone is just a smudge, and the rim alone is just a border.
 *
 * On iOS 26 the first layer is the real thing, and the rest pull back to a whisper
 * so they tint Apple's material rather than smothering it.
 */
export function GlassSurface({
  children,
  backdrop,
  tone = 'regular',
  radius = 'lg',
  corners,
  padding,
  shadow = 'none',
  sheen = true,
  rim = true,
  rimColor,
  tint,
  interactive = false,
  backdropBlur,
  style,
  pointerEvents,
  testID,
}: GlassSurfaceProps) {
  const theme = useTheme();
  const mode = useGlassMode();
  // Not to be confused with the `backdrop` prop: this is the view Android blurs,
  // that is the decoration drawn beneath the material.
  const blurTarget = useGlassBackdrop();

  const layer = theme.glass[tone];
  const corner = typeof radius === 'number' ? radius : theme.radius[radius];
  const elevation = theme.shadows[shadow];

  const androidBlur =
    Platform.OS === 'android' && blurTarget != null && (backdropBlur ?? tone === 'chrome');

  // Apple's material already carries most of the colour, so ours steps aside.
  const fill = useMemo(() => {
    if (mode !== 'native') return layer.fill;
    return withAlpha(layer.fill, alphaOf(layer.fill) * layer.nativeFillScale);
  }, [layer, mode]);

  const shape: ViewStyle = corners
    ? {
        borderTopLeftRadius: corners.topLeft ?? corner,
        borderTopRightRadius: corners.topRight ?? corner,
        borderBottomLeftRadius: corners.bottomLeft ?? corner,
        borderBottomRightRadius: corners.bottomRight ?? corner,
      }
    : { borderRadius: corner };

  const shell: ViewStyle = {
    ...shape,
    // Required for `borderRadius` to clip the native blur view on both platforms.
    overflow: 'hidden',
    padding,
  };

  if (mode === 'opaque') {
    return (
      <View
        testID={testID}
        pointerEvents={pointerEvents}
        style={[
          shell,
          elevation,
          {
            backgroundColor: layer.opaqueFill,
            borderWidth: rim ? theme.layout.hairline : 0,
            borderColor: rimColor ?? layer.border,
          },
          style,
        ]}
      >
        {backdrop}
        {children}
      </View>
    );
  }

  return (
    <View testID={testID} pointerEvents={pointerEvents} style={[shell, elevation, style]}>
      {backdrop}

      {mode === 'native' ? (
        <GlassView
          style={layerStyle}
          glassEffectStyle={layer.nativeStyle}
          tintColor={tint ?? layer.nativeTint}
          isInteractive={interactive}
          // The app is dark-only, so the material must not follow the system.
          colorScheme="dark"
        />
      ) : (
        <BlurView
          style={layerStyle}
          tint={layer.blurTint}
          intensity={layer.intensity}
          blurReductionFactor={layer.blurReduction}
          {...(androidBlur
            ? { blurMethod: 'dimezisBlurViewSdk31Plus' as const, blurTarget }
            : null)}
        />
      )}

      <View style={[layerStyle, { backgroundColor: fill }]} />

      {tint && mode !== 'native' ? <View style={[layerStyle, { backgroundColor: tint }]} /> : null}

      {sheen ? (
        <LinearGradient
          colors={layer.sheen as unknown as readonly [string, string, string]}
          locations={layer.sheenLocations as unknown as readonly [number, number, number]}
          // Slightly off-corner, so the highlight reads as a light source rather
          // than as a gradient that happens to start where the box does.
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={layerStyle}
        />
      ) : null}

      {rim ? (
        <View
          style={[
            layerStyle,
            shape,
            {
              borderWidth: theme.layout.hairline,
              borderColor: rimColor ?? layer.border,
              // Lit above, shaded below: the two edges that give a flat rectangle
              // a thickness. Overridden wholesale once the rim means something,
              // like a selected chip, because then the colour is the message.
              borderTopColor: rimColor ?? layer.highlight,
              borderBottomColor: rimColor ?? layer.lowlight,
            },
          ]}
        />
      ) : null}

      {/* Painted last, so it sits above every layer. Kept as a direct child rather
          than wrapped, so a caller can still lay its content out as a row. */}
      {children}
    </View>
  );
}

/**
 * A full-bleed glass layer for a container that owns its own shape.
 *
 * Use it when the surface cannot be a `GlassSurface` itself — a `Pressable` that
 * has to stay a `Pressable`, or an `Animated.View` already carrying a transform.
 */
export function GlassFill({
  tone = 'regular',
  radius = 'lg',
  corners,
  sheen = true,
  rim = true,
  rimColor,
  tint,
  interactive = false,
  backdropBlur,
  style,
}: Omit<GlassSurfaceProps, 'children' | 'padding' | 'shadow' | 'pointerEvents'>) {
  return (
    <GlassSurface
      tone={tone}
      radius={radius}
      corners={corners}
      sheen={sheen}
      rim={rim}
      rimColor={rimColor}
      tint={tint}
      interactive={interactive}
      backdropBlur={backdropBlur}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    />
  );
}

export type GlossProps = {
  /** Must match the radius of the surface being glossed, or the rim will clip. */
  radius: Radius | number;
  corners?: GlassSurfaceProps['corners'];
  strength?: GlossStrength;
  /** Drop the rim when the surface already draws its own edge. */
  rim?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Glass optics for a surface that has to stay opaque.
 *
 * Some things cannot be see-through and still do their job — the primary button,
 * the add action, a category tile carrying a saturated hue. They keep their fill
 * and borrow the rest: a lit top edge, a diagonal sweep, a shaded underside. It is
 * the same light as the real glass, falling on something solid.
 *
 * Drop it in as the first child of a container with `overflow: 'hidden'`.
 */
export function Gloss({ radius, corners, strength = 'soft', rim = true, style }: GlossProps) {
  const theme = useTheme();
  const gloss = theme.glass.gloss[strength];
  const corner = typeof radius === 'number' ? radius : theme.radius[radius];

  const shape: ViewStyle = corners
    ? {
        borderTopLeftRadius: corners.topLeft ?? corner,
        borderTopRightRadius: corners.topRight ?? corner,
        borderBottomLeftRadius: corners.bottomLeft ?? corner,
        borderBottomRightRadius: corners.bottomRight ?? corner,
      }
    : { borderRadius: corner };

  return (
    <View style={[layerStyle, style]}>
      <LinearGradient
        colors={gloss.colors as unknown as readonly [string, string, string]}
        locations={gloss.locations as unknown as readonly [number, number, number]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[layerStyle, shape]}
      />
      {rim ? (
        <View
          style={[
            layerStyle,
            shape,
            {
              borderWidth: theme.layout.hairline,
              borderColor: gloss.border,
              borderTopColor: gloss.highlight,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

export type PressWashProps = {
  /** 0 at rest, 1 held down — the value `usePressAnimation` hands back. */
  progress: SharedValue<number>;
  radius: Radius | number;
  corners?: GlassSurfaceProps['corners'];
};

/**
 * The light that gathers under a finger.
 *
 * A layer over the material rather than a change to it, for two reasons: it works
 * the same over all three glass renderers, and it keeps the animation off the
 * native glass view itself — fading a Liquid Glass view stops it rendering as
 * glass at all, so the press has to happen on top of it.
 */
export function PressWash({ progress, radius, corners }: PressWashProps) {
  const theme = useTheme();
  const corner = typeof radius === 'number' ? radius : theme.radius[radius];
  const style = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      style={[
        layerStyle,
        style,
        corners
          ? {
              borderTopLeftRadius: corners.topLeft ?? corner,
              borderTopRightRadius: corners.topRight ?? corner,
              borderBottomLeftRadius: corners.bottomLeft ?? corner,
              borderBottomRightRadius: corners.bottomRight ?? corner,
            }
          : { borderRadius: corner },
        { backgroundColor: theme.glass.pressed },
      ]}
    />
  );
}

/** Reads the alpha back off an `rgba()` string produced by the palette helpers. */
function alphaOf(color: string): number {
  const match = /rgba?\([^)]*[\s,]([\d.]+)\s*\)$/.exec(color);
  return match?.[1] ? Number(match[1]) : 1;
}
