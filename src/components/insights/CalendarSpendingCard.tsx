import { useState } from 'react';
import { View } from 'react-native';

import type { AnalyticsBucket } from '@/api/types';
import { TransactionCalendar } from '@/components/transactions/TransactionCalendar';

export type CalendarSpendingCardProps = {
  daily: AnalyticsBucket[];
  onDatePress?: (dateIso: string) => void;
};

export function CalendarSpendingCard({ daily, onDatePress }: CalendarSpendingCardProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // Convert AnalyticsBucket[] to DailySpend format
  const dailySpendData = daily.map((d) => ({
    date: d.key,
    expense: d.expense,
    income: d.income ?? 0,
    count: d.count,
  }));

  const selectedKey = selectedDate.toISOString().split('T')[0];
  const selectedBucket = daily.find((d) => d.key === selectedKey);
  const selectedSpend = selectedBucket?.expense ?? 0;
  const selectedCount = selectedBucket?.count ?? 0;

  return (
    <View>
      <TransactionCalendar
        days={dailySpendData}
        selected={selectedDate}
        onSelect={(date) => {
          setSelectedDate(date);
          onDatePress?.(date.toISOString());
        }}
        onMonthChange={(monthStart) => setSelectedDate(monthStart)}
        selectedCount={selectedCount}
        selectedSpend={selectedSpend}
      />
    </View>
  );
}
