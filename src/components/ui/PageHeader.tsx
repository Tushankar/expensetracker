import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  /** Trailing control, usually an `IconButton`. */
  action?: ReactNode;
  style?: ViewStyle;
};

/**
 * Large in-screen title for tab roots. Tabs render their own header rather than
 * using the navigator's, so the title can scroll with the content instead of
 * sitting in a fixed bar.
 */
export function PageHeader({ title, subtitle, action, style }: PageHeaderProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="header"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.lg,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="h1" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
