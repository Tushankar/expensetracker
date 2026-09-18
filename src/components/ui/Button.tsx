import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';

import { tapFeedback } from '@/utils/haptics';
import { useTheme, type GlassTone, type Theme, type TypeVariant } from '@/theme';

import { GlassFill, Gloss, PressWash } from './GlassSurface';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { usePressAnimation } from './usePressAnimation';

export type ButtonVariant =
  /** The one unmistakable action on a screen. High-contrast neutral fill. */
  | 'primary'
  /** Money-positive actions — the brand green fill. */
  | 'brand'
  /** Paired with a primary. Bordered, sits on a card. */
  | 'secondary'
  /** Quiet brand-tinted fill. Good for repeated actions in a list. */
  | 'tonal'
  /** Text-only. For tertiary actions and toolbar buttons. */
  | 'ghost'
  | 'destructive';

export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: IconName;
  rightIcon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  align?: 'start' | 'center' | 'end';
  /** Suppress the press tick, e.g. for buttons fired repeatedly. */
  haptic?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
  testID?: string;
};

type SizeSpec = {
  height: number;
  paddingHorizontal: number;
  gap: number;
  iconSize: number;
  radius: number;
  textVariant: TypeVariant;
};

function sizeSpec(size: ButtonSize, theme: Theme): SizeSpec {
  switch (size) {
    case 'sm':
      return {
        height: 36,
        paddingHorizontal: theme.spacing.md,
        gap: theme.spacing.xs + 2,
        iconSize: 16,
        radius: theme.radius.sm,
        textVariant: 'labelSm',
      };
    case 'lg':
      return {
        height: 56,
        paddingHorizontal: theme.spacing.xxl,
        gap: theme.spacing.sm + 2,
        iconSize: 20,
        radius: theme.radius.md,
        textVariant: 'h3',
      };
    default:
      return {
        height: 48,
        paddingHorizontal: theme.spacing.xl,
        gap: theme.spacing.sm,
        iconSize: 18,
        radius: theme.radius.md,
        textVariant: 'label',
      };
  }
}

type VariantSpec = {
  background: string;
  backgroundPressed: string;
  foreground: string;
  borderColor?: string;
  /**
   * Draw this variant as glass instead of as a fill. The button then keeps a
   * transparent background and the material shows through it — which is why the
   * pressed colour is irrelevant for these, and a press wash handles it instead.
   */
  glass?: GlassTone;
  /**
   * Glass optics over an opaque fill. For the variants that have to stay solid
   * because they are the one thing on the screen you are meant to press.
   */
  gloss?: 'soft' | 'bright';
};

function variantSpec(variant: ButtonVariant, theme: Theme): VariantSpec {
  const { colors } = theme;
  switch (variant) {
    case 'brand':
      return {
        background: colors.brand,
        backgroundPressed: colors.brandPressed,
        foreground: colors.textOnAccent,
        gloss: 'bright',
      };
    case 'secondary':
      return {
        background: 'transparent',
        backgroundPressed: 'transparent',
        foreground: colors.textPrimary,
        glass: 'regular',
      };
    case 'tonal':
      return {
        background: 'transparent',
        backgroundPressed: 'transparent',
        foreground: colors.brandText,
        glass: 'brand',
      };
    case 'ghost':
      return {
        background: 'transparent',
        backgroundPressed: 'transparent',
        foreground: colors.textPrimary,
        // No material at rest: a ghost button is a word until you touch it, and
        // then the glass forms under your finger.
      };
    case 'destructive':
      return {
        background: colors.negative,
        backgroundPressed: colors.negative,
        foreground: colors.textOnAccent,
        gloss: 'bright',
      };
    default:
      return {
        background: colors.inverse,
        backgroundPressed: colors.inversePressed,
        foreground: colors.textOnAccent,
        // The only white surface in the app. A white sheen over it would be
        // invisible and a dark one would dirty it, so it stays as it is.
      };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  loading = false,
  disabled = false,
  fullWidth = false,
  align,
  haptic = true,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const spec = sizeSpec(size, theme);
  const palette = variantSpec(variant, theme);

  // A loading button must not fire again, but it is "busy" rather than "disabled"
  // so screen readers announce the right thing.
  const inert = disabled || loading;
  const { animatedStyle, progress, onPressIn, onPressOut } = usePressAnimation(
    theme.pressScale.button,
    inert,
  );

  const backgroundStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [palette.background, palette.backgroundPressed],
    ),
  }));

  function handlePress() {
    if (inert) return;
    if (haptic) tapFeedback();
    onPress?.();
  }

  const alignStyle = fullWidth
    ? styles.fullWidth
    : align === 'center'
      ? styles.alignCenter
      : align === 'end'
        ? styles.alignEnd
        : styles.autoWidth;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={inert}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
      // `sm` is below the 48dp minimum target, so extend the touch area instead.
      hitSlop={size === 'sm' ? 8 : 0}
      style={[alignStyle, style]}
    >
      <Animated.View
        style={[
          styles.base,
          // A glass variant keeps its background transparent so the material
          // underneath is what you see; only a fill animates its colour.
          palette.glass ? null : backgroundStyle,
          animatedStyle,
          {
            height: spec.height,
            paddingHorizontal: spec.paddingHorizontal,
            gap: spec.gap,
            borderRadius: spec.radius,
            borderWidth: palette.borderColor ? theme.layout.hairline : 0,
            borderColor: palette.borderColor,
            opacity: disabled ? 0.42 : 1,
          },
        ]}
      >
        {palette.glass ? <GlassFill tone={palette.glass} radius={spec.radius} /> : null}
        {palette.gloss ? <Gloss radius={spec.radius} strength={palette.gloss} /> : null}
        {/* Fills already interpolate their own pressed colour; the glass and ghost
            variants have nothing to interpolate, so the press is a wash. */}
        {palette.glass || variant === 'ghost' ? (
          <PressWash progress={progress} radius={spec.radius} />
        ) : null}

        {loading ? (
          <View style={[StyleSheet.absoluteFill, styles.noTouch]}>
            <View style={styles.center}>
              <ActivityIndicator size="small" color={palette.foreground} />
            </View>
          </View>
        ) : null}

        {/* Content keeps its slot while loading so the button never changes width. */}
        <View style={[styles.content, { gap: spec.gap }, loading && styles.hidden]}>
          {leftIcon ? (
            <Icon name={leftIcon} size={spec.iconSize} color={palette.foreground} />
          ) : null}
          <Text
            variant={spec.textVariant}
            color={palette.foreground}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {label}
          </Text>
          {rightIcon ? (
            <Icon name={rightIcon} size={spec.iconSize} color={palette.foreground} />
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  noTouch: { pointerEvents: 'none' },
  fullWidth: { alignSelf: 'stretch' },
  autoWidth: { alignSelf: 'flex-start' },
  alignCenter: { alignSelf: 'center' },
  alignEnd: { alignSelf: 'flex-end' },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Clips the glass, the gloss and the press wash to the button's corners.
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { opacity: 0 },
});
