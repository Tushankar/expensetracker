import { Pressable, ScrollView, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

export type SuggestionChipsProps = {
  questions: readonly string[];
  onSelect: (question: string) => void;
  /** `wrap` stacks them for the empty state; `row` scrolls them above the composer. */
  layout?: 'row' | 'wrap';
  disabled?: boolean;
  style?: ViewStyle;
};

/**
 * The questions the assistant can be asked, offered before anyone has to guess.
 *
 * A blank chat box is the reason most assistants go unused: the hard part is not
 * reading the answer, it is knowing what can be asked. These are also the
 * phrasings the server's intent matching handles best, so the first attempt lands
 * on a real retrieval rather than a generic summary.
 */
export function SuggestionChips({
  questions,
  onSelect,
  layout = 'row',
  disabled = false,
  style,
}: SuggestionChipsProps) {
  const theme = useTheme();

  const chips = questions.map((question) => (
    <Chip
      key={question}
      label={question}
      disabled={disabled}
      onPress={() => {
        tapFeedback();
        onSelect(question);
      }}
    />
  ));

  if (layout === 'wrap') {
    return (
      <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }, style]}>
        {chips}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        gap: theme.spacing.sm,
        paddingHorizontal: theme.layout.screenGutter,
      }}
      style={style}
    >
      {chips}
    </ScrollView>
  );
}

function Chip({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        borderRadius: theme.radius.pill,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm + 2,
      })}
    >
      <Text variant="labelSm" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
