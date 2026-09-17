import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { tapFeedback } from '@/utils/haptics';
import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';
import { usePressAnimation } from './usePressAnimation';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Usually an `IconTile`. */
  leading?: ReactNode;
  /** Right-hand content — an amount, a value, a switch. */
  trailing?: ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  /**
   * The row's action is already running. It stops firing twice and dims to say
   * so, which is what a row whose work takes a visible moment — an export, a
   * sign-out — needs in place of a button's spinner.
   */
  busy?: boolean;
  /** Announces the row as a choice in a set rather than as a plain button. */
  selected?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
  testID?: string;
};

/**
 * The app's standard row: leading glyph, two lines of text, trailing value.
 *
 * Rows are at least 64dp tall, which clears the 48dp touch minimum with room left
 * over — dense finance lists are the easiest place to end up with mistap targets.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  showChevron = false,
  onPress,
  busy = false,
  selected,
  accessibilityHint,
  style,
  testID,
}: ListRowProps) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(theme.pressScale.card);

  const body = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          minHeight: 64,
          paddingVertical: theme.spacing.md,
          opacity: busy ? 0.6 : 1,
        },
        style,
      ]}
    >
      {leading}

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing}

      {showChevron ? (
        <Icon name="chevronRight" size={17} color={theme.colors.textTertiary} />
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={buildLabel(title, subtitle)}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (busy) return;
        tapFeedback();
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={buildLabel(title, subtitle)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: busy, busy, selected }}
    >
      <Animated.View style={animatedStyle}>{body}</Animated.View>
    </Pressable>
  );
}

/** Screen readers should hear the row as one phrase, not two disconnected labels. */
function buildLabel(title: string, subtitle?: string): string {
  return subtitle ? `${title}, ${subtitle}` : title;
}
