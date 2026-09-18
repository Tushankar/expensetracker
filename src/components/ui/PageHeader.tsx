import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  /**
   * Renders a leading back control. Required on any screen pushed onto the stack
   * that hides the native header — the screen is otherwise a dead end for anyone
   * who does not know the platform's back gesture.
   */
  onBack?: () => void;
  /** Trailing control, usually an `IconButton`. */
  action?: ReactNode;
  style?: ViewStyle;
};

/**
 * Large in-screen title for tab roots and for pushed screens that own their
 * header. Tabs render their own rather than using the navigator's, so the title
 * can scroll with the content instead of sitting in a fixed bar.
 */
export function PageHeader({ title, subtitle, onBack, action, style }: PageHeaderProps) {
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
      {onBack ? (
        <IconButton
          name="arrowLeft"
          accessibilityLabel="Go back"
          variant="surface"
          onPress={onBack}
          // Pulled left so the glyph lines up with the gutter rather than the
          // button's box, which would push the title off the screen's grid.
          style={{ marginLeft: -theme.spacing.xs }}
        />
      ) : null}

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
