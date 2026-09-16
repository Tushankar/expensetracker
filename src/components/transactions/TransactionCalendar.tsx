import { useMemo } from 'react';
import { View } from 'react-native';

import type { DailySpend } from '@/api/types';
import { Calendar, Card, Text, type DayMarker } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';

export type TransactionCalendarProps = {
  days: DailySpend[];
  selected: Date;
  onSelect: (date: Date) => void;
  onMonthChange: (monthStart: Date) => void;
  /** Number of transactions on the selected day, from the list beneath. */
  selectedCount: number;
  selectedSpend: number;
};

/**
 * The month, tinted by what each day cost.
 *
 * Intensity is scaled against the busiest day of the visible month rather than a
 * fixed rupee ceiling, so the shape of a ₹2,000 month and a ₹90,000 month both
 * read — an absolute scale would make one of them a flat grid every time.
 *
 * The summary line under the grid is the point of the view: a date on its own
 * means nothing, and "4 transactions, ₹2,340" is what someone tapped to find out.
 */
export function TransactionCalendar({
  days,
  selected,
  onSelect,
  onMonthChange,
  selectedCount,
  selectedSpend,
}: TransactionCalendarProps) {
  const theme = useTheme();

  const markers = useMemo(() => {
    const busiest = days.reduce((max, day) => Math.max(max, day.expense), 0);
    const map = new Map<string, DayMarker>();

    for (const day of days) {
      if (day.expense <= 0) continue;
      map.set(day.date, {
        intensity: busiest > 0 ? day.expense / busiest : 0,
        label: `${formatINR(day.expense)} spent, ${day.count} ${day.count === 1 ? 'transaction' : 'transactions'}`,
      });
    }
    return map;
  }, [days]);

  const monthSpend = days.reduce((total, day) => total + day.expense, 0);
  const activeDays = days.filter((day) => day.expense > 0).length;

  return (
    <Card radius="xl" padding="xl">
      <Calendar
        value={selected}
        onChange={onSelect}
        onMonthChange={onMonthChange}
        markers={markers}
        initialMonth={selected}
      />

      <View
        style={{
          marginTop: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          borderTopWidth: theme.layout.hairline,
          borderTopColor: theme.colors.divider,
          gap: theme.spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="labelSm" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
            {formatDayLabel(selected.toISOString())}
          </Text>
          <Text variant="labelSm" tone={selectedSpend > 0 ? 'primary' : 'tertiary'}>
            {selectedSpend > 0 ? formatINR(selectedSpend) : 'Nothing spent'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="caption" tone="tertiary" style={{ flex: 1, minWidth: 0 }}>
            {selectedCount === 0
              ? 'No transactions'
              : `${selectedCount} ${selectedCount === 1 ? 'transaction' : 'transactions'}`}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {activeDays > 0
              ? `${formatINR(monthSpend)} across ${activeDays} ${activeDays === 1 ? 'day' : 'days'}`
              : 'Quiet month so far'}
          </Text>
        </View>
      </View>
    </Card>
  );
}
