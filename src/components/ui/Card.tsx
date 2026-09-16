import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { tapFeedback } from '@/utils/haptics';
import { useTheme, type Radius, type ShadowLevel, type Spacing } from '@/theme';

import { usePressAnimation } from './usePressAnimation';

export type CardVariant =
  /** Default. Raised surface with a faint shadow — the app's main container. */
  | 'elevated'
  /** No shadow, hairline border. For dense groupings where shadows would stack. */
  | 'outlined'
  /** Quiet inset panel. Use inside an elevated card, never on the bare canvas. */
  | 'muted';

export type CardProps = {
  children: ReactNode;
  variant?: CardVariant;
  padding?: Spacing | number;
  radius?: Radius;
  shadow?: ShadowLevel;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Card({
  children,
  variant = 'elevated',
  padding,
  radius = 'lg',
  shadow,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: CardProps) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(theme.pressScale.card);

  const pad =
    padding === undefined
      ? theme.layout.cardPadding
      : typeof padding === 'number'
        ? padding
        : theme.spacing[padding];

  const surface: ViewStyle = {
    backgroundColor: variant === 'muted' ? theme.colors.surfaceMuted : theme.colors.surface,
    borderRadius: theme.radius[radius],
    padding: pad,
    // Every card gets a hairline: shadows do almost nothing against a near-black
    // canvas, so the edge is what separates card from page.
    borderWidth: theme.layout.hairline,
    borderColor: variant === 'muted' ? 'transparent' : theme.colors.border,
  };

  const elevation = theme.shadows[shadow ?? (variant === 'elevated' ? 'sm' : 'none')];

  if (!onPress) {
    return (
      <View style={[surface, elevation, style]} testID={testID}>
        {children}
      </View>
    );
  }

  function handlePress() {
    tapFeedback();
    onPress?.();
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={style}
    >
      <Animated.View style={[surface, elevation, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
