import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

import { Text } from './Text';

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

const TRACK_PADDING = 4;
const TRACK_HEIGHT = 44;

/**
 * iOS-style segmented control with a sliding thumb.
 *
 * The thumb is positioned from a measured track width rather than percentages,
 * because a percentage translate would ignore the track's inner padding and drift
 * a couple of points off at the ends.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / options.length : 0;

  const offset = useDerivedValue(() => {
    const target = selectedIndex * segmentWidth;
    return reduceMotion ? withTiming(target, { duration: 0 }) : withSpring(target, theme.spring.press);
  });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  return (
    <View
      onLayout={handleLayout}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: 'row',
          height: TRACK_HEIGHT,
          padding: TRACK_PADDING,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.surfaceMuted,
        },
        style,
      ]}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            thumbStyle,
            theme.shadows.sm,
            {
              position: 'absolute',
              top: TRACK_PADDING,
              left: TRACK_PADDING,
              width: segmentWidth,
              height: TRACK_HEIGHT - TRACK_PADDING * 2,
              borderRadius: theme.radius.xs + 2,
              backgroundColor: theme.colors.surface,
            },
          ]}
        />
      ) : null}

      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (selected) return;
              tapFeedback();
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text
              variant="labelSm"
              tone={selected ? 'primary' : 'secondary'}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
