import { BlurTargetView } from 'expo-blur';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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

import { GlassProvider, GlassTargetOverride } from './GlassSurface';

/** One soft bloom, as a fraction of the surface it sits on. */
type Bloom = {
  /** Index into `theme.glass.aurora`. */
  hue: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

/**
 * Four blooms, arranged so that no two of them peak in the same third of the
 * screen. That is the whole trick: glass reads as glass when the light behind it
 * varies across the width of a single card, and stops reading as anything at all
 * when the field behind it is uniform.
 */
const BLOOMS: readonly Bloom[] = [
  { hue: 0, cx: 0.86, cy: 0.06, rx: 0.78, ry: 0.3 },
  { hue: 3, cx: 0.12, cy: 0.34, rx: 0.68, ry: 0.26 },
  { hue: 1, cx: 0.92, cy: 0.66, rx: 0.6, ry: 0.24 },
  { hue: 2, cx: 0.2, cy: 0.96, rx: 0.72, ry: 0.28 },
];

/** Seconds for one pass of the drift. Slow enough that you have to look for it. */
const DRIFT_SECONDS = 30;

/**
 * Gradient ids have to be unique per field, not per bloom.
 *
 * There is a field at the root and another on every mounted screen, and on the
 * web build every one of them shares a single DOM — where `url(#aurora-0)` would
 * resolve to whichever field rendered first.
 */
let fieldCount = 0;

function nextFieldId(): string {
  fieldCount += 1;
  return `aurora-${fieldCount}`;
}

export type AmbientBackgroundProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The app shell: a drifting field of colour, with everything else floating on
 * glass above it.
 *
 * This component is the reason the rest of the glass works. A frosted panel over a
 * near-black canvas is indistinguishable from a slightly grey one — there is
 * nothing for it to refract. So the canvas stops being black: four very large,
 * very faint blooms in the accent and its neighbours, drifting slowly enough that
 * you would have to watch for it to notice.
 *
 * Mounted once at the root. It carries the field for everything that is not a
 * screen — the tab bar overhang, sheets, the toast — and it owns the single
 * Reduce Transparency subscription for the whole app. Screens lay their own field
 * over the top of it; see `AmbientField`.
 */
export function AmbientBackground({ children, style, testID }: AmbientBackgroundProps) {
  const theme = useTheme();
  const target = useRef<View | null>(null);

  return (
    <View
      testID={testID}
      style={[styles.root, { backgroundColor: theme.colors.background }, style]}
    >
      <Field target={target} />
      <GlassProvider target={target}>{children}</GlassProvider>
    </View>
  );
}

/**
 * The same field, for one screen.
 *
 * Every screen paints its own, for a reason that has nothing to do with looks: a
 * pushed screen has to be opaque, or a native stack transition slides the incoming
 * screen over the outgoing one and you read both at once. An opaque canvas would
 * hide the root field, so each screen carries a copy of it instead — which has the
 * happy side effect of making the view Android blurs the one actually behind the
 * glass on that screen, rather than a field two layers further down.
 *
 * One SVG holding four shapes, with a single transform over the lot, so a screen
 * pays for one extra view.
 */
export function AmbientField({ children, style, testID }: AmbientBackgroundProps) {
  const theme = useTheme();
  const target = useRef<View | null>(null);

  return (
    <View
      testID={testID}
      style={[styles.root, { backgroundColor: theme.colors.background }, style]}
    >
      <Field target={target} />
      <GlassTargetOverride target={target}>{children}</GlassTargetOverride>
    </View>
  );
}

function Field({ target }: { target: RefObject<View | null> }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [prefix] = useState(nextFieldId);

  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0;
      return;
    }
    // `withRepeat(..., -1, true)` reverses rather than restarting, so the field
    // never snaps back to where it began.
    progress.value = withRepeat(
      withTiming(1, { duration: DRIFT_SECONDS * 1000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [progress, reduceMotion]);

  const drift = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * width * -0.08 },
      { translateY: progress.value * height * 0.04 },
      // A little breathing, so the light changes in strength and not only in
      // position — a field that only slides looks like a moving sticker.
      { scale: 1 + progress.value * 0.09 },
    ],
  }));

  return (
    // `collapsable={false}` keeps the wrapper in the native hierarchy: Android
    // drops container views that draw nothing of their own, and a blur target that
    // has been optimised away cannot be sampled.
    <BlurTargetView
      ref={target}
      collapsable={false}
      style={[StyleSheet.absoluteFill, styles.noTouch]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, drift]}>
        <Svg
          width={width}
          height={height}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Defs>
            {BLOOMS.map((bloom, index) => {
              const hue = theme.glass.aurora[bloom.hue];
              if (!hue) return null;
              return (
                <RadialGradient
                  key={`ambient-rad-${prefix}-${bloom.hue}-${index}`}
                  id={`${prefix}-${index}`}
                  cx="50%"
                  cy="50%"
                  r="50%"
                >
                  <Stop offset="0" stopColor={hue.color} stopOpacity={hue.opacity} />
                  <Stop offset="0.45" stopColor={hue.color} stopOpacity={hue.opacity * 0.4} />
                  <Stop offset="1" stopColor={hue.color} stopOpacity={0} />
                </RadialGradient>
              );
            })}
          </Defs>

          {BLOOMS.map((bloom, index) => (
            <Ellipse
              key={`ambient-ellipse-${prefix}-${bloom.hue}-${index}`}
              cx={width * bloom.cx}
              cy={height * bloom.cy}
              rx={width * bloom.rx}
              ry={height * bloom.ry}
              fill={`url(#${prefix}-${index})`}
            />
          ))}
        </Svg>
      </Animated.View>
    </BlurTargetView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  noTouch: { pointerEvents: 'none' },
});
