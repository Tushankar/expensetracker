import { Platform, type ViewStyle } from 'react-native';

export type ShadowLevel = 'none' | 'sm' | 'md' | 'lg';
export type Shadows = Record<ShadowLevel, ViewStyle>;

/**
 * Shadows barely register against a near-black canvas, so surfaces are separated by
 * lightness and a hairline border instead. What is left here is mostly for the
 * things that genuinely float — the add button and the bottom sheet.
 *
 * `elevation` is still set on Android because it also drives z-ordering.
 */
export const shadows: Shadows = {
  none: {},
  sm: Platform.select<ViewStyle>({
    android: { elevation: 0 },
    default: {
      shadowColor: '#000000',
      shadowOpacity: 0.32,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
  }),
  md: Platform.select<ViewStyle>({
    android: { elevation: 0 },
    default: {
      shadowColor: '#000000',
      shadowOpacity: 0.4,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
  }),
  lg: Platform.select<ViewStyle>({
    android: { elevation: 12 },
    default: {
      shadowColor: '#000000',
      shadowOpacity: 0.55,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 14 },
    },
  }),
};
