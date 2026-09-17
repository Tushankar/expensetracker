import { View } from 'react-native';

import type { AnalyticsOverview } from '@/api/types';
import { Card, Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR, formatPercent } from '@/utils/currency';

export type StatGridProps = {
  overview: AnalyticsOverview;
};

/**
 * The four numbers that answer "how is this period going".
 *
 * Income, spending, what was kept and the rate. Deliberately four and not eight:
 * a grid of every figure the API returns is a data dump, and the ones that did
 * not make it here are a scroll away in context rather than competing for the
 * same glance.
 */
export function StatGrid({ overview }: StatGridProps) {
  const theme = useTheme();

  const comparison = overview.monthlyComparison;
  const comparable = comparison.previousExpenses > 0 || comparison.previousIncome > 0;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Stat
          label="Spent"
          value={formatINR(overview.totalExpenses)}
          icon="arrowDownLeft"
          accent={theme.colors.negative}
          // Only when there is something to compare against — "up 100%" from an
          // empty month is noise dressed as a finding.
          delta={
            comparable && comparison.expenseChangePercent !== null
              ? { percent: comparison.expenseChangePercent, goodWhenDown: true }
              : undefined
          }
        />
        <Stat
          label="Earned"
          value={formatINR(overview.totalIncome)}
          icon="arrowUpRight"
          accent={theme.colors.positive}
          delta={
            comparable && comparison.incomeChangePercent !== null
              ? { percent: comparison.incomeChangePercent, goodWhenDown: false }
              : undefined
          }
        />
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Stat
          label={overview.savings < 0 ? 'Overspent' : 'Kept'}
          value={formatINR(Math.abs(overview.savings))}
          icon="piggyBank"
          accent={overview.savings < 0 ? theme.colors.negative : theme.colors.positive}
        />
        <Stat
          label="Savings rate"
          value={overview.savingsRate === null ? '—' : formatPercent(overview.savingsRate)}
          icon="target"
          accent={theme.colors.brandText}
          hint={overview.savingsRate === null ? 'No income recorded' : undefined}
        />
      </View>

      <Card variant="muted" radius="md" padding="lg">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <Icon name="barChart" size={17} color={theme.colors.textTertiary} />
          <Text variant="caption" tone="secondary" style={{ flex: 1, minWidth: 0 }}>
            {/* Divided by the days that have happened, not the days the period
                contains — see the note in the analytics service. */}
            {`${formatINR(overview.averageDailySpend)} a day across ${overview.period.elapsedDays} ${
              overview.period.elapsedDays === 1 ? 'day' : 'days'
            }`}
          </Text>
          {overview.projectedTotal !== null ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {`~${formatINR(overview.projectedTotal)} by month end`}
            </Text>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

type StatProps = {
  label: string;
  value: string;
  icon: IconName;
  accent: string;
  delta?: { percent: number; goodWhenDown: boolean };
  hint?: string;
};

function Stat({ label, value, icon, accent, delta, hint }: StatProps) {
  const theme = useTheme();

  const rose = (delta?.percent ?? 0) > 0;
  // The arrow points the way the number moved; the colour says whether that is
  // good news. Spending down is green even though the arrow points down.
  const good = delta ? rose !== delta.goodWhenDown : true;
  const deltaColor = good ? theme.colors.positive : theme.colors.negative;

  return (
    <Card
      radius="lg"
      padding="lg"
      style={{ flex: 1, minWidth: 0 }}
    >
      <View
        accessible
        accessibilityLabel={
          delta
            ? `${label}, ${value}, ${formatPercent(Math.abs(delta.percent))} ${rose ? 'up' : 'down'}`
            : `${label}, ${value}`
        }
        style={{ gap: 6 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={icon} size={13} color={accent} strokeWidth={2.2} />
          <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
            {label}
          </Text>
        </View>

        <Text
          variant="amountSm"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {value}
        </Text>

        {delta ? (
          <Text variant="caption" color={deltaColor} numberOfLines={1}>
            {`${rose ? '↑' : '↓'} ${formatPercent(Math.abs(delta.percent))} vs last`}
          </Text>
        ) : (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {hint ?? ' '}
          </Text>
        )}
      </View>
    </Card>
  );
}
