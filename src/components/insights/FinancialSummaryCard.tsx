import { View } from 'react-native';

import type { AnalyticsOverview } from '@/api/types';
import { Card, Divider, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';

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

  return (
    <Card radius="xl" padding="lg">
      <View style={{ gap: theme.spacing.md }}>
        {/* Core Spending & Income */}
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
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
              <Icon name="arrowUpRight" size={14} color={theme.colors.negative} strokeWidth={2.5} />
              <Text variant="caption" tone="secondary">
                PERSONAL SPENDING
              </Text>
            </View>
            <Text variant="h3" tone="negative" style={{ marginTop: 4 }}>
              {formatINR(personalExpense)}
            </Text>
            {overview.spendingChange?.text ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ marginTop: 2 }}>
                {overview.spendingChange.text}
              </Text>
            ) : null}
          </View>

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
              <Icon name="arrowDownLeft" size={14} color={theme.colors.positive} strokeWidth={2.5} />
              <Text variant="caption" tone="secondary">
                TOTAL INCOME
              </Text>
            </View>
            <Text variant="h3" tone="positive" style={{ marginTop: 4 }}>
              {formatINR(income)}
            </Text>
            {overview.incomeChange?.text ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ marginTop: 2 }}>
                {overview.incomeChange.text}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Net Cash Flow Banner */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: netCashFlow >= 0 ? theme.colors.positiveSurface : theme.colors.negativeSurface,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radius.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon
              name={netCashFlow >= 0 ? 'wallet' : 'alertCircle'}
              size={14}
              color={netCashFlow >= 0 ? theme.colors.positive : theme.colors.negative}
            />
            <Text
              variant="labelSm"
              style={{ color: netCashFlow >= 0 ? theme.colors.positive : theme.colors.negative }}
            >
              Net Cash Flow
            </Text>
          </View>
          <Text
            variant="label"
            style={{ color: netCashFlow >= 0 ? theme.colors.positive : theme.colors.negative }}
          >
            {netCashFlow >= 0 ? '+' : ''}
            {formatINR(netCashFlow)}
          </Text>
        </View>

        {/* Money Movement Section */}
        {hasMovement ? (
          <>
            <Divider />
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="caption" tone="secondary" style={{ letterSpacing: 0.5 }}>
                MONEY MOVEMENT (EXCLUDED FROM SPENDING / INCOME)
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
