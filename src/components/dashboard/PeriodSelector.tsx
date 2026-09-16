import { Pressable, ScrollView, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { PRIMARY_PERIODS, type Period, type PeriodSelection } from '@/utils/period';
import { tapFeedback } from '@/utils/haptics';

export type PeriodSelectorProps = {
  value: PeriodSelection;
  onChange: (period: Period) => void;
  /** Opened by the Custom chip, and by tapping Custom again to change the dates. */
  onOpenCustom: () => void;
  /** The resolved label, so a custom range can show its own dates on the chip. */
  customLabel?: string;
};

/**
 * The four windows the dashboard offers, as a row of chips.
 *
 * Chips rather than a dropdown because switching period is the most frequent
 * thing anyone does on this screen, and a picker turns a one-tap change into
 * three. Custom is the fourth chip rather than a separate control, so the row
 * still reads as one choice.
 */
export function PeriodSelector({
  value,
  onChange,
  onOpenCustom,
  customLabel,
}: PeriodSelectorProps) {
  const theme = useTheme();

  return (
    <View accessibilityRole="tablist" accessibilityLabel="Period">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.lg }}
      >
        {PRIMARY_PERIODS.map((option) => {
          const selected = option.value === value.period;
          const isCustom = option.value === 'custom';
          // A chosen custom range names its own dates; an unchosen one says "Custom".
          const label = isCustom && selected && customLabel ? customLabel : option.label;

          return (
            <Pressable
              key={option.value}
              onPress={() => {
                tapFeedback();
                // Tapping Custom always opens the picker, including when it is
                // already selected — that is how you change the dates.
                if (isCustom) onOpenCustom();
                else onChange(option.value);
              }}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              accessibilityHint={isCustom ? 'Opens the date range picker' : undefined}
              hitSlop={{ top: 6, bottom: 6 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                height: 36,
                paddingHorizontal: theme.spacing.lg,
                borderRadius: theme.radius.pill,
                backgroundColor: selected ? theme.colors.brandSurface : theme.colors.surface,
                borderWidth: theme.layout.hairline,
                borderColor: selected ? theme.colors.brand : theme.colors.border,
              }}
            >
              {isCustom ? (
                <Icon
                  name="calendar"
                  size={13}
                  color={selected ? theme.colors.brandText : theme.colors.textTertiary}
                  strokeWidth={2}
                />
              ) : null}
              <Text
                variant="labelSm"
                color={selected ? theme.colors.brandText : theme.colors.textSecondary}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
