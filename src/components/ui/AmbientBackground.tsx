import { BlurTargetView } from 'expo-blur';
import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

import { GlassBackdropProvider } from './GlassSurface';

/** One soft bloom, as a fraction of the screen it sits on. */
type Bloom = {
  /** Index into `theme.glass.aurora`. */
  hue: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Seconds for one full drift. Zero pins the bloom in place. */
  drift: number;
  /** How far it travels, as a fraction of the screen. */
  travel: { x: number; y: number };
};

/**
 * Four blooms, arranged so that no two of them peak in the same third of the
 * screen. That is the whole trick: glass reads as glass when the light behind it
 * varies across the width of a single card, and stops reading as anything at all
 * when the field behind it is uniform.
 */
const BLOOMS: readonly Bloom[] = [
  { hue: 0, cx: 0.86, cy: 0.06, rx: 0.78, ry: 0.3, drift: 26, travel: { x: -0.07, y: 0.04 } },
  { hue: 3, cx: 0.12, cy: 0.34, rx: 0.68, ry: 0.26, drift: 34, travel: { x: 0.09, y: -0.05 } },
  { hue: 1, cx: 0.92, cy: 0.66, rx: 0.6, ry: 0.24, drift: 30, travel: { x: -0.06, y: -0.06 } },
  { hue: 2, cx: 0.2, cy: 0.96, rx: 0.72, ry: 0.28, drift: 0, travel: { x: 0, y: 0 } },
];

export type AmbientBackgroundProps = {
  children: ReactNode;
};

/**
 * The app shell: a drifting field of colour, and every screen floating on glass
 * above it.
 *
 * This component is the reason the rest of the glass works. A frosted panel over a
 * near-black canvas is indistinguishable from a slightly grey panel — there is
 * nothing for it to refract. So the canvas stops being black: four very large,
 * very faint blooms in the accent and its neighbours, drifting slowly enough that
 * you would have to watch for it to notice.
 *
 * It also owns the Android blur target. On Android `expo-blur` samples a specific
 * view rather than whatever is behind it, and this field is the correct thing to
 * sample: it is behind everything, and it is the part that carries the colour.
 */
export function AmbientBackground({ children }: AmbientBackgroundProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const target = useRef<View | null>(null);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {/* `collapsable={false}` keeps the view in the native hierarchy: Android
          drops container views with no drawing of their own, and a blur target
          that has been optimised away cannot be sampled. */}
      <BlurTargetView
        ref={target}
        collapsable={false}
        style={[StyleSheet.absoluteFill, styles.noTouch]}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]} />
        {BLOOMS.map((bloom, index) => (
          <DriftingBloom
            key={index}
            bloom={bloom}
            index={index}
            width={width}
            height={height}
          />
        ))}
      </BlurTargetView>

      <GlassBackdropProvider value={target}>{children}</GlassBackdropProvider>
    </View>
  );
}

function DriftingBloom({
  bloom,
  index,
  width,
  height,
}: {
  bloom: Bloom;
  index: number;
  width: number;
  height: number;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const hue = theme.glass.aurora[bloom.hue] ?? theme.glass.aurora[0];
  const progress = useSharedValue(0);
  const animate = bloom.drift > 0 && !reduceMotion;

  useEffect(() => {
    if (!animate) {
      progress.value = 0;
      return;
    }
    // A single sine-like back-and-forth. `withRepeat(..., -1, true)` reverses
    // rather than snapping, so the field never jumps back to its start.
    progress.value = withRepeat(
      withTiming(1, { duration: bloom.drift * 1000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [animate, bloom.drift, progress]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * bloom.travel.x * width },
      { translateY: progress.value * bloom.travel.y * height },
      // A touch of breathing, so the light changes in strength and not only in
      // position — a bloom that only slides looks like a moving sticker.
      { scale: 1 + progress.value * 0.08 },
    ],
  }));

  if (!hue) return null;

  const id = `aurora-${index}`;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.noTouch, style]}>
      <Svg
        width={width}
        height={height}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={hue.color} stopOpacity={hue.opacity} />
            <Stop offset="0.45" stopColor={hue.color} stopOpacity={hue.opacity * 0.4} />
            <Stop offset="1" stopColor={hue.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={width * bloom.cx}
          cy={height * bloom.cy}
          rx={width * bloom.rx}
          ry={height * bloom.ry}
          fill={`url(#${id})`}
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  noTouch: { pointerEvents: 'none' },
});
