import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

export type ThinkingBubbleProps = {
  /** What the server is doing, so the wait explains itself. */
  label?: string;
};

const DOTS = [0, 1, 2];

/**
 * The wait, made honest.
 *
 * "Reading your transactions" rather than "Thinking", because that is what is
 * actually happening first: the server aggregates the real figures before the
 * model is asked to phrase anything. A spinner would say nothing; this says where
 * the answer is coming from.
 */
export function ThinkingBubble({ label = 'Reading your transactions…' }: ThinkingBubbleProps) {
  const theme = useTheme();

  return (
    <Animated.View
      entering={FadeIn.duration(theme.duration.fast)}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        backgroundColor: theme.colors.surface,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderBottomLeftRadius: theme.radius.xs,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {DOTS.map((index) => (
          <Dot key={index} index={index} />
        ))}
      </View>
      <Text variant="bodySm" tone="tertiary">
        {label}
      </Text>
    </Animated.View>
  );
}

function Dot({ index }: { index: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;

    progress.value = withDelay(
      index * 140,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );

    return () => cancelAnimation(progress);
  }, [index, progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ translateY: -progress.value * 2 }],
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.colors.brand,
        },
      ]}
    />
  );
}
