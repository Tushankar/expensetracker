import { View } from 'react-native';

import type { AnalyticsOverview } from '@/api/types';
import { Card, Divider, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR, formatPercent } from '@/utils/currency';

export type FinancialSummaryCardProps = {
  overview: AnalyticsOverview;
};

export function FinancialSummaryCard({ overview }: FinancialSummaryCardProps) {
  const theme = useTheme();

  const personalExpense = overview.personalExpense ?? overview.totalExpenses;
  const income = overview.income ?? overview.totalIncome;
  const netCashFlow = overview.netCashFlow ?? (income - personalExpense);
  const moneyLent = overview.moneyLent ?? 0;
  const moneyBorrowed = overview.moneyBorrowed ?? 0;
  const repaymentsReceived = overview.repaymentsReceived ?? 0;
  const repaymentsMade = overview.repaymentsMade ?? 0;

  const hasMovement =
    moneyLent > 0 || moneyBorrowed > 0 || repaymentsReceived > 0 || repaymentsMade > 0;

  const isPositiveCashFlow = netCashFlow >= 0;

  return (
    <Card radius="xl" padding="lg">
      <View style={{ gap: theme.spacing.md }}>
        {/* Net Cash Flow Banner Hero */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: isPositiveCashFlow
              ? theme.colors.positiveSurface
              : theme.colors.negativeSurface,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm + 2,
            borderRadius: theme.radius.lg,
            borderWidth: theme.layout.hairline,
            borderColor: isPositiveCashFlow
              ? 'rgba(46, 204, 113, 0.2)'
              : 'rgba(231, 76, 60, 0.2)',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: isPositiveCashFlow
                  ? 'rgba(46, 204, 113, 0.25)'
                  : 'rgba(231, 76, 60, 0.25)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon
                name={isPositiveCashFlow ? 'wallet' : 'arrowDownLeft'}
                size={14}
                color={isPositiveCashFlow ? theme.colors.positive : theme.colors.negative}
                strokeWidth={2.4}
              />
            </View>
            <View>
              <Text
                variant="caption"
                style={{
                  color: isPositiveCashFlow ? theme.colors.positive : theme.colors.negative,
                  fontWeight: '600',
                  letterSpacing: 0.3,
                }}
              >
                NET CASH FLOW
              </Text>
              <Text variant="caption" tone="tertiary" style={{ fontSize: 11 }}>
                {isPositiveCashFlow ? 'Surplus retained' : 'Deficit / Net outflow'}
              </Text>
            </View>
          </View>
          <Text
            variant="h3"
            style={{
              color: isPositiveCashFlow ? theme.colors.positive : theme.colors.negative,
              fontWeight: '700',
            }}
          >
            {netCashFlow >= 0 ? '+' : ''}
            {formatINR(netCashFlow)}
          </Text>
        </View>

        {/* Core Spending & Income Pillars */}
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {/* Spending Tile */}
          <View
            style={{
              flex: 1,
              backgroundColor: theme.colors.surfaceMuted,
              padding: theme.spacing.md,
              borderRadius: theme.radius.lg,
              borderWidth: theme.layout.hairline,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: theme.colors.negativeSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="arrowUpRight" size={11} color={theme.colors.negative} strokeWidth={2.5} />
              </View>
              <Text variant="caption" tone="secondary" style={{ fontSize: 11, fontWeight: '600' }}>
                SPENDING
              </Text>
            </View>
            <Text variant="h3" tone="negative" style={{ marginTop: 6, fontWeight: '700' }}>
              {formatINR(personalExpense)}
            </Text>
            {overview.spendingChange?.text ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ marginTop: 2 }}>
                {overview.spendingChange.text}
              </Text>
            ) : null}
          </View>

          {/* Income Tile */}
          <View
            style={{
              flex: 1,
              backgroundColor: theme.colors.surfaceMuted,
              padding: theme.spacing.md,
              borderRadius: theme.radius.lg,
              borderWidth: theme.layout.hairline,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: theme.colors.positiveSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="arrowDownLeft" size={11} color={theme.colors.positive} strokeWidth={2.5} />
              </View>
              <Text variant="caption" tone="secondary" style={{ fontSize: 11, fontWeight: '600' }}>
                INCOME
              </Text>
            </View>
            <Text variant="h3" tone="positive" style={{ marginTop: 6, fontWeight: '700' }}>
              {formatINR(income)}
            </Text>
            {overview.incomeChange?.text ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ marginTop: 2 }}>
                {overview.incomeChange.text}
              </Text>
            ) : (
              <Text variant="caption" tone="tertiary" style={{ marginTop: 2 }}>
                {income === 0 ? 'No income' : ''}
              </Text>
            )}
          </View>
        </View>

        {/* Financial Vitals Row: Savings Rate & Daily Burn Rate */}
        <View
          style={{
            flexDirection: 'row',
            gap: theme.spacing.sm,
            paddingTop: 2,
          }}
        >
          {/* Savings Rate Tile */}
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: theme.colors.surface,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radius.md,
              borderWidth: theme.layout.hairline,
              borderColor: theme.colors.border,
            }}
          >
            <Icon name="target" size={15} color={theme.colors.brandText} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" tone="tertiary" style={{ fontSize: 10 }}>
                SAVINGS RATE
              </Text>
              <Text variant="labelSm" tone="primary" style={{ fontWeight: '600' }}>
                {overview.savingsRate === null ? '—' : formatPercent(overview.savingsRate)}
              </Text>
            </View>
          </View>

          {/* Daily Pace Tile */}
          <View
            style={{
              flex: 1.2,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: theme.colors.surface,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radius.md,
              borderWidth: theme.layout.hairline,
              borderColor: theme.colors.border,
            }}
          >
            <Icon name="barChart" size={15} color={theme.colors.textSecondary} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" tone="tertiary" style={{ fontSize: 10 }}>
                DAILY PACE
              </Text>
              <Text variant="labelSm" tone="primary" style={{ fontWeight: '600' }}>
                {formatINR(overview.averageDailySpend)}/day
              </Text>
            </View>
          </View>
        </View>

        {overview.projectedTotal !== null ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: theme.spacing.xs,
              paddingVertical: 2,
            }}
          >
            <Icon name="info" size={13} color={theme.colors.textTertiary} />
            <Text variant="caption" tone="tertiary" style={{ flex: 1 }}>
              At current pace: ~{formatINR(overview.projectedTotal)} projected by month end
            </Text>
          </View>
        ) : null}

        {/* Money Movement Section */}
        {hasMovement ? (
          <>
            <Divider />
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="caption" tone="secondary" style={{ letterSpacing: 0.5, fontSize: 11 }}>
                MONEY MOVEMENT (EXCLUDED FROM EXPENSES)
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: 4 }}>
                {moneyLent > 0 ? (
                  <View
                    style={{
                      flexBasis: '48%',
                      flexGrow: 1,
                      backgroundColor: theme.colors.surface,
                      padding: theme.spacing.sm,
                      borderRadius: theme.radius.sm,
                    }}
                  >
                    <Text variant="caption" tone="tertiary">
                      Amount Lent
                    </Text>
                    <Text variant="label" tone="primary" style={{ marginTop: 2 }}>
                      {formatINR(moneyLent)}
                    </Text>
                  </View>
                ) : null}

                {repaymentsReceived > 0 ? (
                  <View
                    style={{
                      flexBasis: '48%',
                      flexGrow: 1,
                      backgroundColor: theme.colors.surface,
                      padding: theme.spacing.sm,
                      borderRadius: theme.radius.sm,
                    }}
                  >
                    <Text variant="caption" tone="tertiary">
                      Repayments Received
                    </Text>
                    <Text variant="label" tone="positive" style={{ marginTop: 2 }}>
                      {formatINR(repaymentsReceived)}
                    </Text>
                  </View>
                ) : null}

                {moneyBorrowed > 0 ? (
                  <View
                    style={{
                      flexBasis: '48%',
                      flexGrow: 1,
                      backgroundColor: theme.colors.surface,
                      padding: theme.spacing.sm,
                      borderRadius: theme.radius.sm,
                    }}
                  >
                    <Text variant="caption" tone="tertiary">
                      Amount Borrowed
                    </Text>
                    <Text variant="label" tone="primary" style={{ marginTop: 2 }}>
                      {formatINR(moneyBorrowed)}
                    </Text>
                  </View>
                ) : null}

                {repaymentsMade > 0 ? (
                  <View
                    style={{
                      flexBasis: '48%',
                      flexGrow: 1,
                      backgroundColor: theme.colors.surface,
                      padding: theme.spacing.sm,
                      borderRadius: theme.radius.sm,
                    }}
                  >
                    <Text variant="caption" tone="tertiary">
                      Repayments Made
                    </Text>
                    <Text variant="label" tone="negative" style={{ marginTop: 2 }}>
                      {formatINR(repaymentsMade)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </>
        ) : null}
      </View>
    </Card>
  );
}
