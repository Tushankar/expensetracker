import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { GlassFill } from './GlassSurface';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ToastTone = 'success' | 'error' | 'neutral';

export type ToastProps = {
  message: string;
  /** A second line, e.g. the amount and category that were saved. */
  detail?: string;
  tone?: ToastTone;
  /** Milliseconds on screen before it leaves by itself. */
  duration?: number;
  onDismiss: () => void;
};

const TONE_ICON: Record<ToastTone, IconName> = {
  success: 'checkCircle',
  error: 'alertCircle',
  neutral: 'info',
};

/**
 * Confirmation, without a dialog.
 *
 * The sheet closing already says "something happened"; this says *what*. Saving a
 * ₹40 chai and saving ₹4,000 of petrol look identical from the outside otherwise,
 * and the difference is worth one second of a line of text — particularly for the
 * quick-entry and receipt paths, where the amount came from a parser rather than
 * from someone's thumb.
 *
 * It sits at the bottom because that is where the hand is, and it never blocks:
 * anything behind it stays tappable.
 */
export function Toast({ message, detail, tone = 'success', duration = 2600, onDismiss }: ToastProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = reduceMotion
      ? withTiming(1, { duration: theme.duration.fast })
      : withSpring(1, theme.spring.gentle);

    progress.value = withDelay(
      duration,
      withTiming(0, { duration: theme.duration.base }, (finished) => {
        if (finished) runOnJS(onDismiss)();
      }),
    );
  }, [duration, onDismiss, progress, reduceMotion, theme.duration.base, theme.duration.fast, theme.spring.gentle]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 24 }],
  }));

  const accent =
    tone === 'success'
      ? theme.colors.positive
      : tone === 'error'
        ? theme.colors.negative
        : theme.colors.info;

  return (
    <View
      style={[styles.wrap, { paddingBottom: insets.bottom + theme.spacing.xxxl }]}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        accessible
        accessibilityLabel={detail ? `${message}. ${detail}` : message}
        style={[
          style,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            maxWidth: theme.layout.maxContentWidth - theme.spacing.xxl,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            borderRadius: theme.radius.md,
            overflow: 'hidden',
          },
          theme.shadows.lg,
        ]}
      >
        {/* Thick rather than chrome: it floats free of any edge, and it has to stay
            readable over whatever it happens to land on. */}
        <GlassFill tone="thick" radius="md" />
        <Icon name={TONE_ICON[tone]} size={18} color={accent} strokeWidth={2.2} />
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text variant="labelSm" numberOfLines={1}>
            {message}
          </Text>
          {detail ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    // The scrim is full-screen; only the toast itself takes touches.
    pointerEvents: 'box-none',
  },
});
