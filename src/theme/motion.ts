import { Easing } from 'react-native-reanimated';

/**
 * Motion tokens. The rule for this app: motion confirms an action, it never
 * performs for the user. Anything over ~320ms starts to feel like waiting.
 */
export const duration = {
  instant: 90,
  fast: 150,
  base: 220,
  slow: 320,
  /** Shimmer / breathing loops only. */
  ambient: 1100,
} as const;

export const easing = {
  /** Default for most property changes. */
  standard: Easing.bezier(0.2, 0, 0, 1),
  /** Things entering the screen. */
  decelerate: Easing.out(Easing.cubic),
  /** Things leaving the screen. */
  accelerate: Easing.in(Easing.cubic),
} as const;

/** Spring used for press feedback and the bottom sheet — damped, no visible bounce. */
export const spring = {
  press: { damping: 22, stiffness: 320, mass: 0.7 },
  sheet: { damping: 34, stiffness: 300, mass: 0.9 },
  gentle: { damping: 26, stiffness: 180, mass: 1 },
} as const;

/** How far an interactive surface scales down while pressed. */
export const pressScale = {
  card: 0.985,
  button: 0.97,
  icon: 0.92,
} as const;
