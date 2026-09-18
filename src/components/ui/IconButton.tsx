import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { tapFeedback } from '@/utils/haptics';
import { useTheme, type GlassTone } from '@/theme';

import { GlassFill, PressWash } from './GlassSurface';
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
  const { animatedStyle, progress, onPressIn, onPressOut } = usePressAnimation(
    theme.pressScale.icon,
    disabled,
  );

  const box = BOX[size];

  // `plain` has no material at rest — it is a glyph until you touch it, and then
  // the glass forms under your finger. The other two are simply thicker.
  const material: GlassTone | null =
    variant === 'surface' ? 'regular' : variant === 'tonal' ? 'thin' : null;

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
            opacity: disabled ? 0.42 : 1,
          },
        ]}
      >
        {material ? <GlassFill tone={material} radius={box / 2} sheen={false} /> : null}
        {disabled ? null : <PressWash progress={progress} radius={box / 2} />}
        <Icon name={name} size={GLYPH[size]} color={glyphColor} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `overflow` keeps the round material and the press wash inside the circle.
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
