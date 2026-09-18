import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { AnalyticsOverview } from '@/api/types';
import { BarChart, type Bar } from '@/components/charts';
import { Card, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatCompactINR, formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

export type SpendingTrendCardProps = {
  overview: AnalyticsOverview;
  periodType?: 'day' | 'week' | 'month' | 'year' | 'custom';
};

export function SpendingTrendCard({ overview, periodType = 'month' }: SpendingTrendCardProps) {
  const theme = useTheme();

  const total = overview.personalExpense ?? overview.totalExpenses;
  const average = overview.averageDailySpend;

  // Granularity toggle for month view: 'daily' | 'weekly'
  const [granularity, setGranularity] = useState<'daily' | 'weekly'>('daily');

  // Build the complete timeline data (including quiet days with zero spend)
  const { chartBars, peakDay } = useMemo(() => {
    const daily = overview.daily ?? [];
    const weekly = overview.weekly ?? [];

    let maxExpense = 0;
    let peak: { date: string; amount: number; label: string; index: number } | null = null;
    const map = new Map<string, { expense: number; count: number }>();

    for (const d of daily) {
      map.set(d.key, { expense: d.expense, count: d.count });
    }

    const bars: (Bar & { fullDate?: string; count?: number })[] = [];

    if (periodType === 'week') {
      // 7 days of the week
      const fromDate = new Date(overview.period.from);
      for (let i = 0; i < 7; i++) {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().split('T')[0]!;
        const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayLabel = weekdayNames[d.getDay()] ?? `${d.getDate()}`;
        const item = map.get(key);
        const exp = item?.expense ?? 0;
        const count = item?.count ?? 0;

        if (exp > maxExpense) {
          maxExpense = exp;
          peak = { date: key, amount: exp, label: dayLabel, index: i };
        }

        bars.push({
          label: dayLabel,
          value: exp,
          fullDate: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          count,
        });
      }
    } else if (granularity === 'weekly' && weekly.length > 0) {
      // Weekly aggregation
      weekly.forEach((w, idx) => {
        if (w.expense > maxExpense) {
          maxExpense = w.expense;
          peak = { date: w.key, amount: w.expense, label: w.label, index: idx };
        }
        bars.push({
          label: w.label,
          value: w.expense,
          fullDate: w.label,
          count: w.count,
        });
      });
    } else {
      // Complete month timeline: 1 to daysInMonth (or elapsed days)
      const fromDate = new Date(overview.period.from);
      const totalDays = overview.period.days || 30;
      const year = fromDate.getFullYear();
      const monthStr = String(fromDate.getMonth() + 1).padStart(2, '0');

      for (let day = 1; day <= totalDays; day++) {
        const dayStr = String(day).padStart(2, '0');
        const key = `${year}-${monthStr}-${dayStr}`;
        const item = map.get(key);
        const exp = item?.expense ?? 0;
        const count = item?.count ?? 0;

        if (exp > maxExpense) {
          maxExpense = exp;
          peak = {
            date: key,
            amount: exp,
            label: `${day}`,
            index: day - 1,
          };
        }

        const dateObj = new Date(year, fromDate.getMonth(), day);
        bars.push({
          label: `${day}`,
          value: exp,
          fullDate: dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          count,
        });
      }
    }

    // Mark peak on the bars
    if (peak) {
      const peakBar = bars[peak.index];
      if (peakBar && peakBar.value > 0) {
        peakBar.isPeak = true;
      }
    }

    return { chartBars: bars, peakDay: peak };
  }, [overview.daily, overview.weekly, overview.period, periodType, granularity]);

  // Selected bar state for inspector (defaults to peak day or last day with spend)
  const defaultIndex = useMemo(() => {
    if (peakDay && peakDay.amount > 0) return peakDay.index;
    const lastActive = chartBars.findIndex((b) => b.value > 0);
    return lastActive !== -1 ? lastActive : chartBars.length > 0 ? chartBars.length - 1 : 0;
  }, [chartBars, peakDay]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const activeIndex = selectedIndex ?? defaultIndex;
  const activeBar = chartBars[activeIndex];

  const canToggleGranularity = periodType === 'month' && (overview.weekly?.length ?? 0) > 1;

  return (
    <Card radius="xl" padding="lg">
      <View style={{ gap: theme.spacing.md }}>
        {/* Top Metric Cards */}
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View
            style={{
              flex: 1,
              backgroundColor: theme.colors.surfaceMuted,
              padding: theme.spacing.sm,
              borderRadius: theme.radius.md,
              borderWidth: theme.layout.hairline,
              borderColor: theme.colors.border,
            }}
          >
            <Text variant="caption" tone="tertiary">
              Total Spent
            </Text>
            <Text variant="label" tone="primary" style={{ marginTop: 2 }}>
              {formatINR(total)}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: theme.colors.surfaceMuted,
              padding: theme.spacing.sm,
              borderRadius: theme.radius.md,
              borderWidth: theme.layout.hairline,
              borderColor: theme.colors.border,
            }}
          >
            <Text variant="caption" tone="tertiary">
              Daily Average
            </Text>
            <Text variant="label" tone="primary" style={{ marginTop: 2 }}>
              {formatINR(average)}
            </Text>
          </View>

          {peakDay && peakDay.amount > 0 ? (
            <View
              style={{
                flex: 1.1,
                backgroundColor: theme.colors.surfaceMuted,
                padding: theme.spacing.sm,
                borderRadius: theme.radius.md,
                borderWidth: theme.layout.hairline,
                borderColor: theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
                  Peak Day ({peakDay.label})
                </Text>
              </View>
              <Text variant="label" tone="negative" style={{ marginTop: 2 }}>
                {formatINR(peakDay.amount)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Header Row with Granularity Selector */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 4,
          }}
        >
          {/* Active Inspector Callout */}
          {activeBar ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 3.5,
                  backgroundColor:
                    activeBar.value > 0
                      ? activeBar.isPeak
                        ? theme.colors.negative
                        : theme.colors.brand
                      : theme.colors.textTertiary,
                }}
              />
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {activeBar.fullDate ?? activeBar.label}:{' '}
                <Text
                  variant="caption"
                  tone={activeBar.value > 0 ? 'primary' : 'tertiary'}
                  style={{ fontWeight: '600' }}
                >
                  {activeBar.value > 0 ? formatINR(activeBar.value) : 'No spend'}
                </Text>
                {activeBar.isPeak ? ' 🔥' : ''}
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          {canToggleGranularity ? (
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: theme.colors.surfaceMuted,
                borderRadius: theme.radius.pill,
                padding: 2,
              }}
            >
              <Pressable
                onPress={() => {
                  tapFeedback();
                  setGranularity('daily');
                  setSelectedIndex(null);
                }}
                style={{
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: 3,
                  borderRadius: theme.radius.pill,
                  backgroundColor: granularity === 'daily' ? theme.colors.surface : 'transparent',
                }}
              >
                <Text
                  variant="caption"
                  tone={granularity === 'daily' ? 'primary' : 'tertiary'}
                  style={{ fontSize: 11, fontWeight: granularity === 'daily' ? '600' : '400' }}
                >
                  Daily
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  tapFeedback();
                  setGranularity('weekly');
                  setSelectedIndex(null);
                }}
                style={{
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: 3,
                  borderRadius: theme.radius.pill,
                  backgroundColor: granularity === 'weekly' ? theme.colors.surface : 'transparent',
                }}
              >
                <Text
                  variant="caption"
                  tone={granularity === 'weekly' ? 'primary' : 'tertiary'}
                  style={{ fontSize: 11, fontWeight: granularity === 'weekly' ? '600' : '400' }}
                >
                  Weekly
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* The Bar Chart */}
        {chartBars.length > 0 ? (
          <View style={{ marginTop: 6 }}>
            <BarChart
              data={chartBars}
              color={theme.colors.brand}
              height={110}
              maxBarWidth={chartBars.length <= 7 ? 28 : chartBars.length <= 14 ? 18 : 12}
              selectedIndex={activeIndex}
              onSelectIndex={(idx) => {
                tapFeedback();
                setSelectedIndex(idx);
              }}
              formatValue={formatCompactINR}
              accessibilityLabel={`Spending trend: ${chartBars
                .map((b) => `${b.label} ${formatINR(b.value)}`)
                .join(', ')}`}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}
