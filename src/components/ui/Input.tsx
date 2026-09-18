import { forwardRef, useCallback, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { GlassFill } from './GlassSurface';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

// Derived from the prop types rather than imported: React Native renamed the focus
// event payload in 0.86, and deriving keeps this compiling across versions.
type FocusHandler = NonNullable<TextInputProps['onFocus']>;
type BlurHandler = NonNullable<TextInputProps['onBlur']>;

export type InputProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  /** Sits under the field. Replaced by `error` when that is set. */
  helperText?: string;
  /** Any non-empty string puts the field in its error state. */
  error?: string;
  leftIcon?: IconName;
  /** Static prefix such as the rupee sign. Rendered inside the field. */
  prefix?: string;
  /** Trailing control — a unit label, a picker chevron, a clear button. */
  rightSlot?: ReactNode;
  /** Adds a show/hide toggle and starts masked. Overrides `rightSlot`. */
  secure?: boolean;
  /** Renders the value at display size. For the amount field on an entry form. */
  size?: 'md' | 'amount';
  containerStyle?: ViewStyle;
};

/**
 * Text field with label, helper and error slots.
 *
 * The border animates between rest / focus / error rather than switching instantly,
 * which is the difference between a field that feels responsive and one that feels
 * like a web form.
 *
 * The field is a recessed pane of glass, and the rim is the only thing that moves:
 * the material stays exactly as it is from rest to focus, so the eye is drawn to
 * the one edge that changed rather than to the whole box lighting up.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    helperText,
    error,
    leftIcon,
    prefix,
    rightSlot,
    secure = false,
    size = 'md',
    containerStyle,
    onFocus,
    onBlur,
    editable = true,
    ...rest
  },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [masked, setMasked] = useState(secure);
  const focus = useSharedValue(0);

  const hasError = Boolean(error);
  const isAmount = size === 'amount';

  const handleFocus = useCallback<FocusHandler>(
    (event) => {
      setFocused(true);
      focus.value = withTiming(1, { duration: theme.duration.fast });
      onFocus?.(event);
    },
    [focus, onFocus, theme.duration.fast],
  );

  const handleBlur = useCallback<BlurHandler>(
    (event) => {
      setFocused(false);
      focus.value = withTiming(0, { duration: theme.duration.fast });
      onBlur?.(event);
    },
    [focus, onBlur, theme.duration.fast],
  );

  // Error colour is applied outside the animation so it wins immediately.
  const restBorder = theme.glass.thin.border;
  const activeBorder = theme.colors.brand;

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [restBorder, activeBorder]),
  }));

  const describedBy = error ?? helperText;

  return (
    <View style={containerStyle}>
      {label ? (
        <Text variant="labelSm" tone="secondary" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <Animated.View
        style={[
          styles.field,
          !hasError && borderStyle,
          {
            minHeight: isAmount ? 64 : 52,
            paddingHorizontal: theme.spacing.lg,
            gap: theme.spacing.md,
            borderRadius: theme.radius.md,
            borderWidth: theme.layout.hairline,
            opacity: editable ? 1 : 0.6,
            overflow: 'hidden',
          },
          hasError && { borderColor: theme.colors.negative },
        ]}
      >
        {/* Thinner when the field is read-only, so a disabled row recedes into the
            card instead of looking like something you have failed to tap. */}
        <GlassFill
          tone={editable ? 'thin' : 'ultraThin'}
          radius="md"
          // The animated border above is this surface's rim; a second one from the
          // material would double the hairline and stop it animating.
          rim={false}
          sheen={false}
        />

        {leftIcon ? (
          <Icon
            name={leftIcon}
            size={19}
            color={focused ? theme.colors.brand : theme.colors.textTertiary}
          />
        ) : null}

        {prefix ? (
          <Text
            variant={isAmount ? 'h2' : 'body'}
            tone="tertiary"
            maxFontSizeMultiplier={isAmount ? 1.25 : 1.5}
          >
            {prefix}
          </Text>
        ) : null}

        <TextInput
          ref={ref}
          onFocus={handleFocus}
          onBlur={handleBlur}
          editable={editable}
          secureTextEntry={masked}
          placeholderTextColor={theme.colors.textTertiary}
          selectionColor={theme.colors.brand}
          // Android draws its own underline on top of our border without this.
          underlineColorAndroid="transparent"
          accessibilityLabel={label ?? rest.placeholder}
          accessibilityHint={describedBy}
          accessibilityState={{ disabled: !editable }}
          maxFontSizeMultiplier={isAmount ? 1.25 : 1.5}
          style={[
            styles.input,
            isAmount ? theme.type.amountLg : theme.type.bodyLg,
            { color: theme.colors.textPrimary },
          ]}
          {...rest}
        />

        {secure ? (
          <Pressable
            onPress={() => setMasked((current) => !current)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={masked ? 'Show text' : 'Hide text'}
          >
            <Icon name={masked ? 'eye' : 'eyeOff'} size={19} color={theme.colors.textTertiary} />
          </Pressable>
        ) : (
          rightSlot
        )}
      </Animated.View>

      {describedBy ? (
        <Text
          variant="caption"
          tone={hasError ? 'negative' : 'tertiary'}
          style={styles.helper}
          accessibilityLiveRegion={hasError ? 'polite' : 'none'}
        >
          {describedBy}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { marginBottom: 8 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    // RN vertically centres single-line input on iOS but top-aligns on Android;
    // zeroing the built-in padding lets `alignItems: center` do the work on both.
    paddingVertical: 0,
    margin: 0,
  },
  helper: { marginTop: 6 },
});
