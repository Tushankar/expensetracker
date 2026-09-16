import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { tapFeedback } from '@/utils/haptics';
import { useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { usePressAnimation } from './usePressAnimation';

export type IconButtonProps = {
  name: IconName;
  onPress?: () => void;
  /** Required: an icon-only control is invisible to screen readers without it. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'plain' | 'surface' | 'tonal';
  color?: string;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
};

const BOX = { sm: 36, md: 44, lg: 48 } as const;
const GLYPH = { sm: 18, md: 20, lg: 22 } as const;

export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  size = 'md',
  variant = 'plain',
  color,
  disabled = false,
  style,
  testID,
}: IconButtonProps) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(
    theme.pressScale.icon,
    disabled,
  );

  const box = BOX[size];
  const background =
    variant === 'surface'
      ? theme.colors.surface
      : variant === 'tonal'
        ? theme.colors.surfaceMuted
        : 'transparent';

  const glyphColor =
    color ?? (variant === 'tonal' ? theme.colors.textSecondary : theme.colors.textPrimary);

  function handlePress() {
    if (disabled) return;
    tapFeedback();
    onPress?.();
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      // Pads every size out to the 48dp minimum target without changing its look.
      hitSlop={Math.max(0, (theme.layout.minTouchTarget - box) / 2)}
      style={style}
    >
      <Animated.View
        style={[
          styles.box,
          animatedStyle,
          {
            width: box,
            height: box,
            borderRadius: box / 2,
            backgroundColor: background,
            borderWidth: variant === 'surface' ? theme.layout.hairline : 0,
            borderColor: theme.colors.border,
            opacity: disabled ? 0.42 : 1,
          },
        ]}
      >
        <Icon name={name} size={GLYPH[size]} color={glyphColor} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
