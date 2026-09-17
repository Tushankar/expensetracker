import { useEffect, useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { QUICK_ENTRY_EXAMPLES, errorMessage, isNetworkError } from '@/api';
import { Button, Icon, Input, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

export type QuickEntryPanelProps = {
  onSubmit: (text: string) => void;
  loading: boolean;
  error: unknown;
  /** Pre-fill from the Home Quick Add bar. Auto-submits on mount when present. */
  initialText?: string;
};

/** Longer than this is a note, not a shorthand. Matches the server's own cap. */
const MAX_LENGTH = 160;

/**
 * The typed way in: one line, one tap.
 *
 * The examples are not decoration. A free-text field with no shape is the fastest
 * way to make someone type a sentence and get a shrug back, and one glance at
 * "Petrol 1200" teaches the whole grammar. They are also the phrasings the
 * server's parser handles best, so the first attempt lands.
 *
 * Nothing here saves anything. Submitting produces a preview, which is where the
 * decision is made.
 */
export function QuickEntryPanel({ onSubmit, loading, error, initialText }: QuickEntryPanelProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState(initialText ?? '');
  const autoSubmitted = useRef(false);

  // Auto-submit when opened with text from the Home bar
  useEffect(() => {
    if (initialText && initialText.trim() && !autoSubmitted.current) {
      autoSubmitted.current = true;
      onSubmit(initialText.trim());
    }
  }, [initialText, onSubmit]);

  const canSubmit = text.trim().length > 0 && !loading;

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    tapFeedback();
    onSubmit(trimmed);
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Input
        ref={inputRef}
        autoFocus
        label="What did you spend?"
        placeholder="e.g. Petrol 1200, Zomato 450"
        value={text}
        onChangeText={setText}
        maxLength={MAX_LENGTH}
        returnKeyType="go"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!loading}
        onSubmitEditing={() => submit(text)}
        leftIcon="sparkles"
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="caption" tone="tertiary">
          FOR EXAMPLE
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {QUICK_ENTRY_EXAMPLES.map((example) => (
            <Pressable
              key={example}
              disabled={loading}
              onPress={() => {
                tapFeedback();
                setText(example);
                inputRef.current?.focus();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Use example: ${example}`}
              style={({ pressed }) => ({
                opacity: loading ? 0.5 : pressed ? 0.7 : 1,
                borderRadius: theme.radius.pill,
                borderWidth: theme.layout.hairline,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceMuted,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: 6,
              })}
            >
              <Text variant="caption" tone="secondary">
                {example}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error ? (
        <Animated.View
          entering={FadeIn.duration(theme.duration.fast)}
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.negativeSurface,
          }}
        >
          <Icon
            name={isNetworkError(error) ? 'wifiOff' : 'alertCircle'}
            size={16}
            color={theme.colors.negative}
          />
          <Text variant="caption" tone="negative" style={{ flex: 1 }}>
            {isNetworkError(error)
              ? 'You are offline, so this could not be read. Use the keypad instead.'
              : errorMessage(error)}
          </Text>
        </Animated.View>
      ) : null}

      <Button
        label="Read it"
        onPress={() => submit(text)}
        variant="brand"
        size="lg"
        fullWidth
        loading={loading}
        disabled={!canSubmit}
      />

      <Text variant="caption" tone="tertiary" align="center">
        You will see what it read before anything is saved.
      </Text>
    </View>
  );
}
