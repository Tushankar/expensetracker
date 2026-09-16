import { View } from 'react-native';

import { DonutChart } from '@/components/charts';
import { Card, ChipRow, EmptyState, Icon, SectionHeader, Text, type Chip } from '@/components/ui';
import { useTheme } from '@/theme';
import type { CategorySlice, PeriodSummary } from '@/types/models';
import { formatCompactINR, formatINR, percentChange } from '@/utils/currency';
import { PERIOD_OPTIONS, type Period } from '@/utils/period';

/** The chips, typed for `ChipRow`. The options themselves live with the range maths. */
export const PERIODS: readonly Chip<Period>[] = PERIOD_OPTIONS;

export type SpendingOverviewProps = {
  summary: PeriodSummary;
  /** Largest first. Anything past the fifth is already folded into "Others". */
  breakdown: readonly CategorySlice[];
  period: Period;
  onPeriodChange: (period: Period) => void;
  onSeeAll?: () => void;
};

/**
 * Where the period's money went: the total on the left, the category split on the
 * right.
 *
 * Every figure here comes from the server's aggregation over the whole period, not
 * from whichever page of transactions the app happens to have loaded. That is why
 * the period chips re-query instead of re-filtering — a "6 months" chip that
 * silently summarised the most recent 25 rows would be worse than no chip at all.
 */
export function SpendingOverview({
  summary,
  breakdown,
  period,
  onPeriodChange,
  onSeeAll,
}: SpendingOverviewProps) {
  const theme = useTheme();

  const delta = percentChange(summary.spent, summary.previousSpent);
  const spendingUp = (delta ?? 0) > 0;

  const segments = breakdown.map((slice) => ({
    key: slice.key,
    share: slice.share,
    color: slice.color,
    label: slice.label,
    percent: Math.round(slice.share * 100),
  }));

  return (
    <View>
      <SectionHeader title="Spending overview" actionLabel="See all" onActionPress={onSeeAll} />

      <ChipRow
        options={PERIODS}
        value={period}
        onChange={onPeriodChange}
        accessibilityLabel="Spending period"
        style={{ marginBottom: theme.spacing.lg }}
      />

      {summary.spent === 0 ? (
        <Card radius="lg" padding="lg">
          <EmptyState
            icon="pieChart"
            title="Nothing spent yet"
            description="Once you add an expense, the split lands here."
          />
        </Card>
      ) : (
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
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}
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
            ) : null}

            <View
              style={{
                marginTop: theme.spacing.lg,
                paddingTop: theme.spacing.md,
                borderTopWidth: theme.layout.hairline,
                borderTopColor: theme.colors.divider,
                gap: theme.spacing.sm,
              }}
            >
              <Row label="Earned" value={formatINR(summary.income)} tone="positive" />
              <Row
                label="Saved"
                value={formatINR(summary.saved, { signed: true })}
                tone={summary.saved < 0 ? 'negative' : 'positive'}
              />
              {summary.transferred > 0 ? (
                <Row label="Moved" value={formatINR(summary.transferred)} tone="tertiary" />
              ) : null}
            </View>
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
      )}
    </View>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'tertiary';
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text variant="caption" tone="tertiary" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
        {label}
      </Text>
      <Text variant="caption" tone={tone} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
