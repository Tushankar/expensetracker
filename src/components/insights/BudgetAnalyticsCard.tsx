import { Fragment } from 'react';
import { View } from 'react-native';

import type { AnalyticsBudgetStatus } from '@/api/types';
import { Card, Divider, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';

export type BudgetAnalyticsCardProps = {
  budgetStatus: AnalyticsBudgetStatus;
};

export function BudgetAnalyticsCard({ budgetStatus }: BudgetAnalyticsCardProps) {
  const theme = useTheme();

  const items = budgetStatus.items ?? [];
  if (!budgetStatus.hasBudgets || items.length === 0) {
    return null;
  }

  return (
    <Card padding={0} radius="xl">
      <View style={{ padding: theme.spacing.lg }}>
        {items.map((item, index) => {
          const isExceeded = item.state === 'exceeded';
          const isWarning = item.state === 'warning';
          const barColor = isExceeded
            ? theme.colors.negative
            : isWarning
              ? theme.colors.warning
              : theme.colors.positive;

          const progressPercent = Math.min(100, Math.max(0, item.percent));

          return (
            <Fragment key={`budget-status-${item.id || index}-${index}`}>
              {index > 0 ? (
                <View style={{ marginVertical: theme.spacing.sm }}>
                  <Divider />
                </View>
              ) : null}
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="label" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="labelSm" tone={isExceeded ? 'negative' : 'primary'}>
                    {formatINR(item.spent)} / {formatINR(item.budgeted)}
                  </Text>
                </View>

                {/* Progress Bar */}
                <View
                  style={{
                    height: 6,
                    backgroundColor: theme.colors.surfaceMuted,
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${progressPercent}%`,
                      backgroundColor: barColor,
                      borderRadius: 3,
                    }}
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="caption" tone={isExceeded ? 'negative' : 'tertiary'}>
                    {isExceeded
                      ? `${formatINR(Math.abs(item.remaining))} over budget`
                      : `${formatINR(item.remaining)} remaining`}
                  </Text>
                  <Text
                    variant="caption"
                    style={{
                      color: isExceeded
                        ? theme.colors.negative
                        : isWarning
                          ? theme.colors.warning
                          : theme.colors.textSecondary,
                    }}
                  >
                    {item.percent}% used
                  </Text>
                </View>
              </View>
            </Fragment>
          );
        })}
      </View>
    </Card>
  );
}
