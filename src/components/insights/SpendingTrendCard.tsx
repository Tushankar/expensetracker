import { useMemo } from 'react';
import { View } from 'react-native';

import type { AnalyticsOverview } from '@/api/types';
import { BarChart } from '@/components/charts';
import { Card, Divider, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatCompactINR, formatINR } from '@/utils/currency';

export type SpendingTrendCardProps = {
  overview: AnalyticsOverview;
  periodType?: 'day' | 'week' | 'month' | 'year' | 'custom';
};

export function SpendingTrendCard({ overview, periodType = 'month' }: SpendingTrendCardProps) {
  const theme = useTheme();

  const total = overview.personalExpense ?? overview.totalExpenses;
  const average = overview.averageDailySpend;

  // Find peak spending day
  const { peakDay, chartData } = useMemo(() => {
    const daily = overview.daily ?? [];
    let maxExpense = 0;
    let peak: { date: string; amount: number; label: string } | null = null;

    for (const d of daily) {
      if (d.expense > maxExpense) {
        maxExpense = d.expense;
        peak = {
          date: d.key,
          amount: d.expense,
          label: d.label,
        };
      }
    }

    // Determine chart items based on available buckets
    let data: { label: string; value: number }[] = [];
    if (periodType === 'week' || (daily.length > 0 && daily.length <= 14)) {
      data = daily.map((d) => ({
        label: d.label,
        value: d.expense,
      }));
    } else if (overview.weekly && overview.weekly.length > 1) {
      data = overview.weekly.map((w) => ({
        label: w.label,
        value: w.expense,
      }));
    } else {
      data = daily.map((d) => ({
        label: d.label,
        value: d.expense,
      }));
    }

    return { peakDay: peak, chartData: data };
  }, [overview.daily, overview.weekly, periodType]);

  return (
    <Card radius="xl" padding="lg">
      <View style={{ gap: theme.spacing.md }}>
        {/* Metric Row: Total, Average, Peak Day */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="tertiary">
              Total Spent
            </Text>
            <Text variant="label" tone="primary" style={{ marginTop: 2 }}>
              {formatINR(total)}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="tertiary">
              Daily Average
            </Text>
            <Text variant="label" tone="primary" style={{ marginTop: 2 }}>
              {formatINR(average)}
            </Text>
          </View>

          {peakDay ? (
            <View style={{ flex: 1.2 }}>
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                Peak Day ({peakDay.label})
              </Text>
              <Text variant="label" tone="negative" style={{ marginTop: 2 }}>
                {formatINR(peakDay.amount)}
              </Text>
            </View>
          ) : null}
        </View>

        {chartData.length > 0 ? (
          <>
            <Divider />
            <View style={{ marginTop: 4 }}>
              <BarChart
                data={chartData}
                color={theme.colors.brand}
                height={100}
                gap={chartData.length > 15 ? 4 : 8}
                formatValue={formatCompactINR}
                accessibilityLabel={`Spending trend: ${chartData
                  .map((b) => `${b.label} ${formatINR(b.value)}`)
                  .join(', ')}`}
              />
            </View>
          </>
        ) : null}
      </View>
    </Card>
  );
}
