import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { tapFeedback } from '@/utils/haptics';
import { useTheme, type GlassTone, type Radius, type ShadowLevel, type Spacing } from '@/theme';

import { GlassSurface, PressWash } from './GlassSurface';
import { usePressAnimation } from './usePressAnimation';

export type CardVariant =
  /** Default. A slab of glass floating on the ambient field — the main container. */
  | 'elevated'
  /** Thinner glass, no lift. For dense groupings where every row is a card. */
  | 'outlined'
  /** The quietest glass there is. Use inside another card, never on bare canvas. */
  | 'muted'
  /** Accent-tinted glass. For the one card on a screen that is being offered. */
  | 'brand'
  /** The deep, saturated slab. Reserved for a screen's hero. */
  | 'hero';

/** Which rung of the glass ladder each variant sits on. */
const VARIANT_TONE: Record<CardVariant, GlassTone> = {
  elevated: 'regular',
  outlined: 'thin',
  muted: 'ultraThin',
  brand: 'brand',
  hero: 'hero',
};

export type CardProps = {
  children: ReactNode;
  variant?: CardVariant;
  /** Overrides the variant's material outright. */
  tone?: GlassTone;
  padding?: Spacing | number;
  radius?: Radius;
  shadow?: ShadowLevel;
  /** Turn the diagonal specular sweep off — for very short or very busy cards. */
  sheen?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The app's container.
 *
 * Every card is a piece of glass: a blurred backdrop, a tint that gives it its
 * colour, a diagonal sheen, and a rim lit along the top edge and shaded along the
 * bottom. What separates one variant from the next is only how thick that glass
 * is, which is what keeps a nested panel reading as *inside* the card it sits in
 * rather than as a second card that happens to be smaller.
 *
 * `GlassSurface` handles everything below the content, including the three ways
 * the effect can be drawn on a given device.
 */
export function Card({
  children,
  variant = 'elevated',
  tone,
  padding,
  radius = 'lg',
  shadow,
  sheen = true,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: CardProps) {
  const theme = useTheme();
  const { animatedStyle, progress, onPressIn, onPressOut } = usePressAnimation(
    theme.pressScale.card,
  );

  const pad =
    padding === undefined
      ? theme.layout.cardPadding
      : typeof padding === 'number'
        ? padding
        : theme.spacing[padding];

  const material = tone ?? VARIANT_TONE[variant];

  // Glass already floats; the shadow is only there to keep the hero and the
  // accent card from sitting flush against the field behind them.
  const elevation: ShadowLevel =
    shadow ?? (variant === 'hero' ? 'md' : variant === 'muted' || variant === 'outlined' ? 'none' : 'sm');

  if (!onPress) {
    return (
      <GlassSurface
        testID={testID}
        tone={material}
        radius={radius}
        padding={pad}
        shadow={elevation}
        sheen={sheen}
        style={style}
      >
        {children}
      </GlassSurface>
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
      {/* The scale lives out here rather than on the glass, because a transform on
          an ancestor of the native glass view is fine while an opacity is not:
          fading a Liquid Glass view out stops it rendering as glass at all. The
          press state is therefore a wash *over* the material, not under it. */}
      <Animated.View style={animatedStyle}>
        <GlassSurface tone={material} radius={radius} padding={pad} shadow={elevation} sheen={sheen}>
          <PressWash progress={progress} radius={radius} />
          {children}
        </GlassSurface>
      </Animated.View>
    </Pressable>
  );
}
