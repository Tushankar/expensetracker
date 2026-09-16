import { Pressable, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

import { Icon } from './Icon';
import { Text } from './Text';
import { usePressAnimation } from './usePressAnimation';

export type KeypadProps = {
  /** A digit, `.` or `back`. */
  onKey: (key: string) => void;
  onLongBackspace?: () => void;
  style?: ViewStyle;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

/**
 * The amount keypad on the entry sheet.
 *
 * Rendering our own instead of raising the system numeric keyboard is what makes
 * the add flow feel instant. The OS keyboard animates in over ~250ms, resizes the
 * sheet, and on Android often covers the very button you are about to press — so
 * the sheet has to scroll, and "tap plus, type, save" stops being three gestures.
 * A keypad that is simply *there* costs nothing and never moves.
 *
 * Keys are 64dp tall, well past the 48dp minimum, because this is the one control
 * in the app people will use every single day.
 */
export function Keypad({ onKey, onLongBackspace, style }: KeypadProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -theme.spacing.xs },
        style,
      ]}
    >
      {KEYS.map((key) => (
        <Key
          key={key}
          value={key}
          onPress={() => onKey(key)}
          onLongPress={key === 'back' ? onLongBackspace : undefined}
        />
      ))}
    </View>
  );
}

type KeyProps = {
  value: string;
  onPress: () => void;
  onLongPress?: () => void;
};

function Key({ value, onPress, onLongPress }: KeyProps) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(0.93);

  const isBackspace = value === 'back';
  const label = isBackspace ? 'Delete' : value === '.' ? 'Decimal point' : value;

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={isBackspace && onLongPress ? 'Hold to clear the amount' : undefined}
      style={{ width: '33.333%', paddingHorizontal: theme.spacing.xs, paddingVertical: 3 }}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            height: 58,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceMuted,
          },
        ]}
      >
        {isBackspace ? (
          <Icon name="close" size={20} color={theme.colors.textSecondary} strokeWidth={2.2} />
        ) : (
          <Text variant="h2" maxFontSizeMultiplier={1.2}>
            {value}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}
