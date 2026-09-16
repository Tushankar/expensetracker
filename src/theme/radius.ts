/**
 * Corner radii. Cards live in the 16–24 range; anything smaller reads as
 * "utility", anything larger starts to look like a toy.
 */
export const radius = {
  none: 0,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  pill: 999,
} as const;

export type Radius = keyof typeof radius;
