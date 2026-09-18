import { useCallback, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon, Text, usePressAnimation } from '@/components/ui';
import { useUiStore } from '@/store/uiStore';
import { useTheme } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

/**
 * A compact pill on the Home screen for quick expense entry.
 *
 * This is purely a shortcut into the existing AddTransactionSheet flow.
 * Typing here and pressing Enter opens the sheet in quick mode with the text
 * pre-filled. It is NOT a separate mini-accounting system.
 *
 * Two entry paths:
 * 1. Tap the pill → opens the full quick entry panel (focus the input there)
 * 2. Type text + Enter → opens the sheet and auto-parses the text
 */
export function QuickAddBar() {
  const theme = useTheme();
  const openAddSheet = useUiStore((state) => state.openAddSheet);
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(theme.pressScale.card);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      tapFeedback();
      openAddSheet('expense', trimmed);
      setText('');
      inputRef.current?.blur();
    } else {
      // Empty tap → open the full quick entry panel
      tapFeedback();
      openAddSheet('expense', undefined);
    }
  }, [text, openAddSheet]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="search"
        accessibilityLabel="Quick add expense"
        accessibilityHint="Type something like Zomato 450 to quickly add an expense"
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: 12,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surfaceMuted,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderTopColor: 'rgba(255, 255, 255, 0.16)',
          }}
        >
          <Icon name="sparkles" size={16} color={theme.colors.brand} />

          <TextInput
            ref={inputRef}
            placeholder='Try "Zomato 450" or "Petrol 1200"'
            placeholderTextColor={theme.colors.textTertiary}
            value={text}
            onChangeText={setText}
            maxLength={160}
            returnKeyType="go"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleSubmit}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              borderWidth: 0,
              paddingVertical: 0,
              paddingHorizontal: 0,
              color: theme.colors.textPrimary,
              fontSize: 14,
            }}
          />

          {text.trim().length > 0 ? (
            <Pressable
              onPress={handleSubmit}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Parse expense"
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: theme.colors.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="arrowRight" size={14} color="#FFFFFF" />
              </View>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                tapFeedback();
                openAddSheet('expense');
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Open quick add"
            >
              <Text variant="caption" tone="brand">
                Quick Add
              </Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
