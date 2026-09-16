import { DarkTheme, type Theme as NavTheme } from '@react-navigation/native';

import type { Theme } from '@/theme';

/**
 * Bridges our tokens into React Navigation's own theme so screen backgrounds,
 * card transitions and the header do not flash the library's default white.
 */
export function toNavigationTheme(theme: Theme): NavTheme {
  const base = DarkTheme;

  return {
    ...base,
    dark: true,
    colors: {
      ...base.colors,
      primary: theme.colors.brand,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      notification: theme.colors.negative,
    },
    fonts: {
      regular: { fontFamily: theme.fontFamily.regular, fontWeight: '400' },
      medium: { fontFamily: theme.fontFamily.medium, fontWeight: '500' },
      bold: { fontFamily: theme.fontFamily.semibold, fontWeight: '600' },
      heavy: { fontFamily: theme.fontFamily.bold, fontWeight: '700' },
    },
  };
}
