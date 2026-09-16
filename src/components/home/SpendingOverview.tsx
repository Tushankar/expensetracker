import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { BarChart, DonutChart } from '@/components/charts';
import { Card, ChipRow, Icon, SectionHeader, Text, type Chip } from '@/components/ui';
import { getCategory } from '@/data/mock';
import { categoryColor, useTheme } from '@/theme';
import type { CategorySpend, MonthSummary, WeeklySpend } from '@/types/models';
import { formatCompactINR, formatINR, percentChange } from '@/utils/currency';

type Period = 'month' | 'last' | '3m' | '6m' | '1y';

const PERIODS: readonly Chip<Period>[] = [
  { value: 'month', label: 'This Month' },
  { value: 'last', label: 'Last Month' },
  { value: '3m', label: '3 Months' },
  { value: '6m', label: '6 Months' },
  { value: '1y', label: '1 Year' },
];

export type SpendingOverviewProps = {
  summary: MonthSummary;
  breakdown: readonly CategorySpend[];
  weekly: readonly WeeklySpend[];
  onSeeAll?: () => void;
};

/**
 * Where the month went: the weekly shape on the left, the category split on the
 * right.
 *
 * Two charts rather than one because they answer different questions — "am I
 * speeding up?" and "on what?" — and neither answers the other.
 */
export function SpendingOverview({ summary, breakdown, weekly, onSeeAll }: SpendingOverviewProps) {
  const theme = useTheme();
  // Only the current month exists in the sample data, so the other ranges select
  // but do not re-query. They wire up with the API.
  const [period, setPeriod] = useState<Period>('month');

  const segments = useMemo(
    () =>
      breakdown.map((entry) => {
        const category = getCategory(entry.categoryId);
        return {
          key: entry.categoryId,
          share: entry.share,
          color: categoryColor(category.hue),
          label: category.label,
          percent: Math.round(entry.share * 100),
        };
      }),
    [breakdown],
  );

  const delta = percentChange(summary.spent, summary.previousSpent);
  const spendingUp = (delta ?? 0) > 0;

  return (
    <View>
      <SectionHeader title="Spending overview" actionLabel="See all" onActionPress={onSeeAll} />

      <ChipRow
        options={PERIODS}
        value={period}
        onChange={setPeriod}
        accessibilityLabel="Spending period"
        style={{ marginBottom: theme.spacing.lg }}
      />

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Card radius="lg" padding="lg" style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" tone="tertiary">
            Total Spent
          </Text>
          <Text
            variant="amount"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ marginTop: 4 }}
          >
            {formatINR(summary.spent)}
          </Text>

          {delta !== null ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                marginTop: 4,
                marginBottom: theme.spacing.lg,
              }}
            >
              <Icon
                name={spendingUp ? 'trendingUp' : 'trendingDown'}
                size={12}
                color={spendingUp ? theme.colors.negative : theme.colors.positive}
                strokeWidth={2.4}
              />
              <Text
                variant="caption"
                color={spendingUp ? theme.colors.negative : theme.colors.positive}
                numberOfLines={1}
              >
                {`${Math.abs(delta).toFixed(0)}% `}
                <Text variant="caption" tone="tertiary">
                  vs last
                </Text>
              </Text>
            </View>
          ) : (
            <View style={{ height: theme.spacing.lg }} />
          )}

          <BarChart
            data={weekly.map((week) => ({ label: week.label, value: week.amount }))}
            color={theme.colors.brand}
            height={64}
            gap={6}
            formatValue={formatCompactINR}
          />
        </Card>

        {/* Wider than its neighbour: it has to hold a ring and a six-row legend. */}
        <Card radius="lg" padding="lg" style={{ flex: 1.7, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <DonutChart
              segments={segments}
              size={64}
              thickness={9}
              accessibilityLabel={`Spending split: ${segments
                .map((segment) => `${segment.label} ${segment.percent}%`)
                .join(', ')}`}
            >
              <Text
                variant="caption"
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
                style={{ fontSize: 11, lineHeight: 14 }}
              >
                {formatCompactINR(summary.spent)}
              </Text>
              <Text
                variant="caption"
                tone="tertiary"
                maxFontSizeMultiplier={1.1}
                style={{ fontSize: 9, lineHeight: 12 }}
              >
                Total
              </Text>
            </DonutChart>

            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              {segments.map((segment) => (
                <View
                  key={segment.key}
                  accessible
                  accessibilityLabel={`${segment.label}, ${segment.percent} percent`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: segment.color,
                    }}
                  />
                  <Text
                    variant="caption"
                    tone="secondary"
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {segment.label}
                  </Text>
                  <Text
                    variant="caption"
                    tone="tertiary"
                    maxFontSizeMultiplier={1.2}
                    // Fixed column keeps the percentages aligned down the legend.
                    style={{ width: 28, textAlign: 'right' }}
                  >
                    {`${segment.percent}%`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Card>
      </View>
    </View>
  );
}
