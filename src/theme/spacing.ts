/**
 * 4pt spacing scale. Every gap, pad and margin in the app comes from here —
 * that consistency is most of what "generous, calm spacing" actually means.
 */
export const spacing = {
  none: 0,
  hair: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
  colossal: 64,
} as const;

export type Spacing = keyof typeof spacing;

export const layout = {
  /** Horizontal gutter for every screen. Content never touches the edge. */
  screenGutter: 16,
  /** Inner padding for a standard card. */
  cardPadding: 20,
  /** Minimum tap target — iOS HIG is 44, Android Material is 48. Use the larger. */
  minTouchTarget: 48,
  /** Height of the custom tab bar, excluding the bottom safe-area inset. */
  tabBarHeight: 64,
  /** Hairline that survives on 2x/3x screens. */
  hairline: 1,
  /** Widest the content column is allowed to grow on tablets / web. */
  maxContentWidth: 560,
} as const;
