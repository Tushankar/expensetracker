import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type LoadingStateProps = {
  /** Shown under the spinner. Keep it specific: "Loading budgets", not "Loading". */
  label?: string;
  fill?: boolean;
  style?: ViewStyle;
};

/**
 * Spinner state, for waits too short or too unstructured to justify a skeleton.
 *
 * It fades in after a beat so a fast response never produces a spinner flash —
 * the single cheapest thing you can do to make an app feel quick.
 */
export function LoadingState({ label, fill = true, style }: LoadingStateProps) {
  const theme = useTheme();

  return (
    <Animated.View
      entering={FadeIn.delay(180).duration(theme.duration.base)}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
      accessibilityState={{ busy: true }}
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.md,
          paddingVertical: theme.spacing.xxxl,
        },
        fill && { flex: 1 },
        style,
      ]}
    >
      <ActivityIndicator size="small" color={theme.colors.textTertiary} />
      {label ? (
        <Text variant="bodySm" tone="tertiary" align="center">
          {label}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** Inline spinner for use inside a row or beside a label. */
export function Spinner({ color }: { color?: string }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
      <ActivityIndicator size="small" color={color ?? colors.textTertiary} />
    </View>
  );
}
