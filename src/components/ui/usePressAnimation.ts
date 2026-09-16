import { useCallback } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

type PressAnimation = {
  /** Apply to the visual layer. Collapses to a no-op under "reduce motion". */
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
  /** 0 = at rest, 1 = held down. Drive colour interpolation from this. */
  progress: SharedValue<number>;
  onPressIn: () => void;
  onPressOut: () => void;
};

/**
 * Scale-down press feedback shared by every interactive surface, so a card, a
 * button and a list row all respond with the same weight.
 *
 * Honours the OS "reduce motion" setting by dropping the movement while keeping
 * `progress` live, so colour feedback still works for those users.
 */
export function usePressAnimation(scaleTo: number, disabled = false): PressAnimation {
  const { spring } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  const onPressIn = useCallback(() => {
    if (disabled) return;
    progress.value = withSpring(1, spring.press);
  }, [disabled, progress, spring.press]);

  const onPressOut = useCallback(() => {
    progress.value = withSpring(0, spring.press);
  }, [progress, spring.press]);

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    return { transform: [{ scale: 1 - progress.value * (1 - scaleTo) }] };
  });

  return { animatedStyle, progress, onPressIn, onPressOut };
}
