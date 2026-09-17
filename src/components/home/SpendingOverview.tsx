import { Pressable, useWindowDimensions, View } from 'react-native';

import { DonutChart } from '@/components/charts';
import { Card, EmptyState, SectionHeader, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { CategorySlice, Paise } from '@/types/models';
import { formatCompactINR, formatINR } from '@/utils/currency';

export type SpendingOverviewProps = {
  spent: Paise;
  /** Largest first. Anything past the fifth is already folded into "Others". */
  breakdown: readonly CategorySlice[];
  onSeeAll?: () => void;
  onCategoryPress?: (categoryKey: string, categoryLabel: string) => void;
};

/**
 * Below this the legend cannot hold a label, an amount and a percentage without
 * one of them truncating. The percentage is the one to drop — the donut already
 * shows the proportion, and the rupee figure is the part you cannot read off it.
 */
const PERCENT_COLUMN_MIN_WIDTH = 360;

/**
 * Where the period's money went.
 *
 * One chart and one list, both driven by the same server-side aggregation over
 * the whole period — not by whichever page of transactions happens to be loaded.
 * That is why changing the period re-queries instead of re-filtering: a "6
 * months" view that quietly summarised the most recent 25 rows would be worse
 * than no view at all.
 *
 * Amounts sit beside the percentages because a share without a figure is not
 * actionable — "Food, 32%" does not tell you whether to worry.
 */
export function SpendingOverview({
  spent,
  breakdown,
  onSeeAll,
  onCategoryPress,
}: SpendingOverviewProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const showPercent = width >= PERCENT_COLUMN_MIN_WIDTH;

  const segments = breakdown.map((slice) => ({
    key: slice.key,
    share: slice.share,
    color: slice.color,
    label: slice.label,
    percent: Math.round(slice.share * 100),
    amount: slice.amount,
  }));

  return (
    <View>
      <SectionHeader
        title="Where it went"
        actionLabel={onSeeAll ? 'See all' : undefined}
        onActionPress={onSeeAll}
      />

      {spent === 0 || segments.length === 0 ? (
        <Card radius="lg" padding="lg">
          <EmptyState
            icon="pieChart"
            title="Nothing spent yet"
            description="Once you record an expense, the split lands here."
          />
        </Card>
      ) : (
        <Card radius="xl" padding="xl">
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: showPercent ? theme.spacing.xl : theme.spacing.lg,
            }}
          >
            <DonutChart
              segments={segments}
              size={showPercent ? 104 : 88}
              thickness={showPercent ? 13 : 11}
              accessibilityLabel={`Spending split: ${segments
                .map((segment) => `${segment.label} ${segment.percent}%`)
                .join(', ')}`}
            >
              <Text variant="labelSm" numberOfLines={1} maxFontSizeMultiplier={1.1}>
                {formatCompactINR(spent)}
              </Text>
              <Text variant="caption" tone="tertiary" maxFontSizeMultiplier={1.1}>
                spent
              </Text>
            </DonutChart>

            <View style={{ flex: 1, minWidth: 0, gap: theme.spacing.sm }}>
              {segments.map((segment) => {
                const RowComponent = onCategoryPress ? Pressable : View;
                return (
                  <RowComponent
                    key={segment.key}
                    onPress={onCategoryPress ? () => onCategoryPress(segment.key, segment.label) : undefined}
                    accessible
                    accessibilityRole={onCategoryPress ? 'button' : undefined}
                    accessibilityLabel={`${segment.label}, ${formatINR(segment.amount)}, ${segment.percent} percent`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
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
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.2}
                    >
                      {formatCompactINR(segment.amount)}
                    </Text>
                    {showPercent ? (
                      <Text
                        variant="caption"
                        tone="tertiary"
                        maxFontSizeMultiplier={1.2}
                        // Fixed column keeps the percentages aligned down the legend.
                        style={{ width: 32, textAlign: 'right' }}
                      >
                        {`${segment.percent}%`}
                      </Text>
                    ) : null}
                  </RowComponent>
                );
              })}
            </View>
          </View>
        </Card>
      )}
    </View>
  );
}
