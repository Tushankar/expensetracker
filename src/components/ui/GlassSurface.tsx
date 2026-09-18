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
 * Android blurs a *target view*, not whatever happens to be underneath — so every
 * glass surface needs a handle on the thing it is supposed to be refracting. The
 * ambient background publishes that handle here; without one, `expo-blur` warns
 * and silently degrades, so we check before ever asking for a blur method.
 */
const GlassBackdropContext = createContext<RefObject<View | null> | null>(null);

export const GlassBackdropProvider = GlassBackdropContext.Provider;

export function useGlassBackdrop(): RefObject<View | null> | null {
  return useContext(GlassBackdropContext);
}

/**
 * Whether the glass may actually be see-through.
 *
 * Reduce Transparency is the whole reason this is a hook rather than a constant:
 * somebody who has asked the system for solid backgrounds should get solid
 * backgrounds, and the setting can change while the app is open.
 */
export function useGlassMode(): GlassMode {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const backdrop = useGlassBackdrop();

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

  if (reduceTransparency) return 'opaque';
  if (isLiquidGlassAvailable()) return 'native';

  // Android below 31 has no cheap backdrop blur, and `expo-blur` there renders a
  // flat translucent panel anyway — which is exactly what `opaque` already does,
  // only without a native view in the tree for every card on the screen.
  if (Platform.OS === 'android' && (Platform.Version as number) < 31) return 'opaque';
  if (Platform.OS === 'android' && !backdrop) return 'opaque';

  return 'blur';
}

export type GlassSurfaceProps = {
  children?: ReactNode;
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
  const backdrop = useGlassBackdrop();

  const layer = theme.glass[tone];
  const corner = typeof radius === 'number' ? radius : theme.radius[radius];
  const elevation = theme.shadows[shadow];

  const androidBlur =
    Platform.OS === 'android' && backdrop != null && (backdropBlur ?? tone === 'chrome');

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
        {children}
      </View>
    );
  }

  return (
    <View testID={testID} pointerEvents={pointerEvents} style={[shell, elevation, style]}>
      {mode === 'native' ? (
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle={layer.nativeStyle}
          tintColor={tint ?? layer.nativeTint}
          isInteractive={interactive}
          // The app is dark-only, so the material must not follow the system.
          colorScheme="dark"
          pointerEvents="none"
        />
      ) : (
        <BlurView
          style={StyleSheet.absoluteFill}
          tint={layer.blurTint}
          intensity={layer.intensity}
          blurReductionFactor={layer.blurReduction}
          {...(androidBlur
            ? { blurMethod: 'dimezisBlurViewSdk31Plus' as const, blurTarget: backdrop }
            : null)}
          pointerEvents="none"
        />
      )}

      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} pointerEvents="none" />

      {tint && mode !== 'native' ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} pointerEvents="none" />
      ) : null}

      {sheen ? (
        <LinearGradient
          colors={layer.sheen as unknown as readonly [string, string, string]}
          locations={layer.sheenLocations as unknown as readonly [number, number, number]}
          // Slightly off-corner, so the highlight reads as a light source rather
          // than as a gradient that happens to start where the box does.
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}

      {rim ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
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
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient
        colors={gloss.colors as unknown as readonly [string, string, string]}
        locations={gloss.locations as unknown as readonly [number, number, number]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[StyleSheet.absoluteFill, shape]}
      />
      {rim ? (
        <View
          style={[
            StyleSheet.absoluteFill,
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
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
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
