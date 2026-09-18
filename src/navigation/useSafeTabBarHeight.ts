import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext } from 'react';

/**
 * Returns the bottom tab bar height if mounted inside a Bottom Tab Navigator,
 * or the provided fallback (defaults to 0) without throwing.
 */
export function useSafeBottomTabBarHeight(fallback = 0): number {
  return useContext(BottomTabBarHeightContext) ?? fallback;
}
