import { useEffect } from 'react';
import { TextInput, type TextInputProps, type TextStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme, type TypeVariant } from '@/theme';
import { RUPEE } from '@/utils/currency';

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

export type AnimatedAmountProps = {
  /** Integer paise, as everywhere else in the app. */
  value: number;
  variant?: TypeVariant;
  color?: string;
  /** Replaces the figure entirely, for the hidden-balance state. */
  placeholder?: string;
  /** Announced to screen readers, which never see the animation. */
  accessibilityLabel?: string;
  style?: TextStyle;
};

/**
 * A rupee figure that counts to its new value instead of jumping to it.
 *
 * Used for the balance, which is the one number on screen that changes *because
 * of something the person just did*. Watching it move from ₹42,300 to ₹42,260
 * after recording a ₹40 chai is the app confirming the entry landed — and it says
 * it faster and more precisely than any toast.
 *
 * Rendered into a read-only `TextInput` rather than a `Text`, which is the only
 * way to drive changing text from the UI thread in Reanimated: `Text` has no
 * animatable text prop, so a `Text` version would have to re-render on the JS
 * thread sixty times a second and would stutter on exactly the mid-range phones
 * this is meant to feel good on.
 *
 * Honours reduce-motion by snapping, and the accessible label always carries the
 * final value rather than whatever frame the animation is on.
 */
export function AnimatedAmount({
  value,
  variant = 'amountLg',
  color,
  placeholder,
  accessibilityLabel,
  style,
}: AnimatedAmountProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const animated = useSharedValue(value);

  useEffect(() => {
    animated.value = reduceMotion
      ? value
      : withTiming(value, { duration: 520, easing: theme.easing.decelerate });
  }, [animated, reduceMotion, theme.easing.decelerate, value]);

  /**
   * `text` is a real prop on the native TextInput but not on the public
   * `TextInputProps`, which is why this is spelled out rather than inferred.
   */
  const props = useAnimatedProps<TextInputProps & { text: string }>(() => {
    'worklet';

    if (placeholder) return { text: placeholder };

    // Indian grouping, inside a worklet. The shared `groupIndian` cannot be
    // called here — a worklet only sees what it captures, and a regex-based
    // helper from another module is not it.
    const rupees = Math.round(animated.value / 100);
    const negative = rupees < 0;
    const digits = String(Math.abs(rupees));

    let grouped = digits;
    if (digits.length > 3) {
      const last3 = digits.slice(-3);
      const rest = digits.slice(0, -3);
      let paired = '';
      for (let i = rest.length; i > 0; i -= 2) {
        const start = Math.max(0, i - 2);
        paired = rest.slice(start, i) + (paired ? `,${paired}` : '');
      }
      grouped = `${paired},${last3}`;
    }

    return { text: `${negative ? '−' : ''}${RUPEE}${grouped}` };
  });

  return (
    <AnimatedInput
      // A display element that happens to be an input. Everything that makes it
      // behave like one is turned off.
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      // iOS refuses to render a TextInput's value without one on first paint.
      value={placeholder ?? ''}
      animatedProps={props}
      accessible
      accessibilityLabel={accessibilityLabel}
      maxFontSizeMultiplier={1.2}
      style={[
        theme.type[variant],
        {
          color: color ?? theme.colors.textPrimary,
          // A TextInput carries platform padding a Text does not.
          padding: 0,
          margin: 0,
        },
        style,
      ]}
    />
  );
}
