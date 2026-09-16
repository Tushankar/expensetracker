import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAccentStore } from '@/store/themeStore';

import type { AccentId } from './palette';
import { defaultTheme, themes, type Theme } from './theme';

const ThemeContext = createContext<Theme>(defaultTheme);

/**
 * Provides the design tokens for the selected accent.
 *
 * The app is dark-only; what changes is the accent, and an accent tints the whole
 * neutral ramp rather than just the brand colour.
 */
export function ThemeProvider({
  children,
  forceAccent,
}: {
  children: ReactNode;
  /** Pins the accent regardless of preference. For screenshots and tests. */
  forceAccent?: AccentId;
}) {
  const accent = useAccentStore((state) => state.accent);
  const value = useMemo(() => themes[forceAccent ?? accent], [accent, forceAccent]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the active theme. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Build a StyleSheet from the active theme, recomputed only when the accent changes.
 *
 *   const styles = useThemedStyles(({ colors, spacing }) =>
 *     StyleSheet.create({ row: { padding: spacing.lg, backgroundColor: colors.surface } }),
 *   );
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const active = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- factory is defined at module scope
  return useMemo(() => factory(active), [active]);
}
