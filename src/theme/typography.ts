import type { TextStyle } from 'react-native';

/**
 * Inter, loaded at runtime in `App.tsx`. React Native has no synthetic weight
 * mapping for custom fonts, so each weight is its own family name and we never
 * set `fontWeight` alongside `fontFamily`.
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export type FontFamily = keyof typeof fontFamily;

/**
 * One scale for the whole app. Sizes step on a ~1.2 ratio; tracking tightens as
 * size grows, which is what stops large Inter from looking loose.
 *
 * Nothing here is smaller than 12pt — tiny text is the fastest way to make a
 * finance app feel cheap and fail accessibility at the same time.
 */
export type TypeVariant =
  | 'displayLg'
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bodyLg'
  | 'body'
  | 'bodySm'
  | 'label'
  | 'labelSm'
  | 'caption'
  | 'overline'
  | 'amountLg'
  | 'amount'
  | 'amountSm';

/** Inter exposes tabular figures via OpenType `tnum`; essential so columns of money don't jitter. */
const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const typeScale: Record<TypeVariant, TextStyle> = {
  displayLg: { fontFamily: fontFamily.bold, fontSize: 40, lineHeight: 46, letterSpacing: -1.1 },
  display: { fontFamily: fontFamily.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  h1: { fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.6 },
  h2: { fontFamily: fontFamily.semibold, fontSize: 21, lineHeight: 28, letterSpacing: -0.4 },
  h3: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },

  bodyLg: { fontFamily: fontFamily.regular, fontSize: 17, lineHeight: 26, letterSpacing: -0.1 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  bodySm: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, letterSpacing: 0 },

  label: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 18, letterSpacing: -0.05 },
  labelSm: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 16, letterSpacing: 0 },
  caption: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  overline: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  amountLg: {
    fontFamily: fontFamily.bold,
    fontSize: 38,
    lineHeight: 46,
    letterSpacing: -1.4,
    ...tabular,
  },
  amount: {
    fontFamily: fontFamily.semibold,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.4,
    ...tabular,
  },
  amountSm: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.2,
    ...tabular,
  },
};

/**
 * Font map handed to `expo-font`. Keys must match `fontFamily` above.
 */
export { fontFamily as fontFamilies };
