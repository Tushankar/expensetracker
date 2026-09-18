import { Pressable, View, type ViewStyle } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

export type MonthSwitcherProps = {
  /** Already formatted, e.g. "September 2026". */
  label: string;
  /** True when the label is the month we are actually living in. */
  isCurrent: boolean;
  /** Line under the label — days left, or the month's status. */
  caption?: string;
  onPrevious: () => void;
  onNext: () => void;
  /** Jump back to the current month. Hidden while already there. */
  onReturn: () => void;
  style?: ViewStyle;
};

/**
 * The month control.
 *
 * One bar rather than three loose controls: the arrows are chrome and belong
 * inside the surface they act on, which leaves the month itself as the only
 * thing with any visual weight. Nothing here can walk past the current month —
 * budgets have no future to show.
 */
export function MonthSwitcher({
  label,
  isCurrent,
  caption,
  onPrevious,
  onNext,
  onReturn,
  style,
}: MonthSwitcherProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          height: 56,
          paddingHorizontal: theme.spacing.xs,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.surface,
          borderWidth: theme.layout.hairline,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <Arrow
        direction="chevronLeft"
        label="Previous month"
        hint={`Shows the month before ${label}`}
        onPress={onPrevious}
      />

      <Pressable
        onPress={
          isCurrent
            ? undefined
            : () => {
                tapFeedback();
                onReturn();
              }
        }
        disabled={isCurrent}
        accessibilityRole={isCurrent ? 'text' : 'button'}
        accessibilityLabel={`Showing ${label}`}
        accessibilityHint={isCurrent ? undefined : 'Returns to this month'}
        style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 1 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {isCurrent ? (
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: theme.colors.brandText,
              }}
            />
          ) : null}
          <Text variant="h3" numberOfLines={1}>
            {label}
          </Text>
        </View>
        {caption ? (
          <Text
            variant="caption"
            color={isCurrent ? theme.colors.textTertiary : theme.colors.brandText}
            numberOfLines={1}
          >
            {caption}
          </Text>
        ) : null}
      </Pressable>

      <Arrow
        direction="chevronRight"
        label="Next month"
        hint={`Shows the month after ${label}`}
        onPress={onNext}
        disabled={isCurrent}
      />
    </View>
  );
}

function Arrow({
  direction,
  label,
  hint,
  onPress,
  disabled = false,
}: {
  direction: 'chevronLeft' | 'chevronRight';
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        tapFeedback();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled ? undefined : hint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed && !disabled ? theme.colors.surfaceStrong : 'transparent',
        opacity: disabled ? 0.28 : 1,
      })}
    >
      <Icon name={direction} size={18} color={theme.colors.textSecondary} strokeWidth={2.2} />
    </Pressable>
  );
}
