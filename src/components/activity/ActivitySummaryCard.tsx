import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { BarChart } from '@/components/charts';
import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { MonthSummary, WeeklySpend } from '@/types/models';
import { formatCompactINR, formatINR, percentChange } from '@/utils/currency';
import { monthLabel } from '@/utils/date';

export type ActivitySummaryCardProps = {
  summary: MonthSummary;
  /** One bar per day so far this month. */
  daily: readonly WeeklySpend[];
  /** Available width, so the chart can be sized without a layout pass. */
  width: number;
};

/**
 * The month's spend at the top of Activity: the total on the left, the daily shape
 * on the right.
 *
 * The bars are unlabelled on purpose — at one bar per day there is no room for an
 * axis, and the point is the rhythm of the month rather than any single day.
 */
export function ActivitySummaryCard({ summary, daily, width }: ActivitySummaryCardProps) {
  const theme = useTheme();

  const delta = percentChange(summary.spent, summary.previousSpent);
  const spendingUp = (delta ?? 0) > 0;

  const padding = theme.spacing.xl;
  const inner = width - padding * 2;
  const chartWidth = Math.max(120, Math.round(inner * 0.46));

  return (
    <LinearGradient
      colors={[theme.colors.heroSurface, theme.colors.heroSurfaceEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        theme.shadows.md,
        {
          borderRadius: theme.radius.xl,
          borderWidth: theme.layout.hairline,
          borderColor: theme.colors.heroBorder,
          padding,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Text variant="caption" color={theme.colors.heroTextMuted} style={{ flex: 1, minWidth: 0 }}>
          Total spent
        </Text>
        <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
          {monthLabel(summary.month)}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: theme.spacing.md,
          marginTop: theme.spacing.md,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            variant="display"
            color={theme.colors.heroText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {formatINR(summary.spent)}
          </Text>

          {delta !== null ? (
            <View
              accessible
              accessibilityLabel={`Spending ${spendingUp ? 'up' : 'down'} ${Math.abs(
                delta,
              ).toFixed(0)} percent versus last month`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                marginTop: theme.spacing.sm,
              }}
            >
              <Icon
                name={spendingUp ? 'trendingUp' : 'trendingDown'}
                size={13}
                color={spendingUp ? theme.colors.heroNegative : theme.colors.heroPositive}
                strokeWidth={2.4}
              />
              <Text
                variant="caption"
                color={spendingUp ? theme.colors.heroNegative : theme.colors.heroPositive}
              >
                {`${Math.abs(delta).toFixed(0)}%`}
              </Text>
              <Text variant="caption" color={theme.colors.heroTextMuted}>
                vs last month
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ width: chartWidth }}>
          <BarChart
            data={daily.map((day) => ({ label: day.label, value: day.amount }))}
            color={theme.colors.brandText}
            height={64}
            gap={3}
            barRadius={2}
            showLabels={false}
            formatValue={formatCompactINR}
            accessibilityLabel={`Daily spending for the last ${daily.length} days`}
          />
        </View>
      </View>
    </LinearGradient>
  );
}
