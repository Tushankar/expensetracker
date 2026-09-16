import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BottomSheet, Button, Calendar, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { tapFeedback } from '@/utils/haptics';
import {
  ALL_PERIODS,
  dayFromKey,
  dayKeyOf,
  periodRange,
  type Period,
  type PeriodSelection,
} from '@/utils/period';

export type DateRangeSheetProps = {
  visible: boolean;
  value: PeriodSelection;
  onClose: () => void;
  onApply: (selection: PeriodSelection) => void;
};

function shortDay(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()] ?? ''}`;
}

/**
 * The custom range picker, with the longer presets alongside it.
 *
 * Presets and a calendar in one sheet because "last 3 months" is a range someone
 * would otherwise have to construct by hand, and burying it behind a separate
 * control would mean two places to look for the same kind of answer.
 *
 * The caller passes a `key` that changes on each open, so the draft starts from
 * whatever is currently selected without an effect copying props into state.
 */
export function DateRangeSheet({ visible, value, onClose, onApply }: DateRangeSheetProps) {
  const theme = useTheme();

  const today = new Date();
  const initial = value.period === 'custom' && value.customFrom && value.customTo
    ? { from: dayFromKey(value.customFrom), to: dayFromKey(value.customTo) }
    : { from: today, to: today };

  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  /** True once the user has tapped a start and is choosing an end. */
  const [picking, setPicking] = useState(false);

  function choosePreset(period: Period) {
    tapFeedback();
    onApply({ period });
  }

  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Choose a period"
      maxHeightRatio={0.92}
      footer={
        <Button
          label={picking ? 'Pick an end date' : `Apply · ${spanDays} ${spanDays === 1 ? 'day' : 'days'}`}
          onPress={() =>
            onApply({ period: 'custom', customFrom: dayKeyOf(from), customTo: dayKeyOf(to) })
          }
          variant="brand"
          size="lg"
          fullWidth
          disabled={picking}
        />
      }
    >
      <Text variant="labelSm" tone="secondary" style={{ marginBottom: theme.spacing.sm }}>
        Quick ranges
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {ALL_PERIODS.map((option) => {
          const selected = option.value === value.period;
          return (
            <Pressable
              key={option.value}
              onPress={() => choosePreset(option.value)}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              style={{
                height: 38,
                paddingHorizontal: theme.spacing.md,
                justifyContent: 'center',
                borderRadius: theme.radius.pill,
                backgroundColor: selected ? theme.colors.brandSurface : theme.colors.surfaceMuted,
                borderWidth: theme.layout.hairline,
                borderColor: selected ? theme.colors.brand : 'transparent',
              }}
            >
              <Text
                variant="caption"
                color={selected ? theme.colors.brandText : theme.colors.textSecondary}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginTop: theme.spacing.xxl,
          marginBottom: theme.spacing.lg,
          padding: theme.spacing.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceMuted,
        }}
      >
        <Edge label="From" value={shortDay(from)} active={picking} />
        <Icon name="arrowRight" size={15} color={theme.colors.textTertiary} />
        <Edge label="To" value={picking ? '—' : shortDay(to)} active={!picking} />
      </View>

      <Calendar
        mode="range"
        value={from}
        endValue={picking ? undefined : to}
        initialMonth={from}
        onChange={(date) => {
          // First tap of a new selection: the range collapses to that day until
          // the second tap closes it.
          setFrom(date);
          setPicking(true);
        }}
        onChangeRange={(start, end) => {
          setFrom(start);
          setTo(end);
          setPicking(false);
        }}
      />

      <Text
        variant="caption"
        tone="tertiary"
        align="center"
        style={{ marginTop: theme.spacing.lg }}
      >
        {picking
          ? 'Now pick the last day of the range.'
          : `Comparing against the ${spanDays === 1 ? 'day' : `${spanDays} days`} before.`}
      </Text>

      <View style={{ height: theme.spacing.md }} />
    </BottomSheet>
  );
}

function Edge({ label, value, active }: { label: string; value: string; active: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="labelSm" color={active ? theme.colors.brandText : theme.colors.textPrimary}>
        {value}
      </Text>
    </View>
  );
}

/** Re-exported so callers do not need two imports to show the resolved label. */
export { periodRange };
