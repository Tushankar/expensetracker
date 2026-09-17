import { Fragment } from 'react';
import { View } from 'react-native';

import type { RecurringAnalytics } from '@/api/types';
import { Card, Divider, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';

export type RecurringAnalyticsCardProps = {
  recurringSummary: RecurringAnalytics;
};

export function RecurringAnalyticsCard({ recurringSummary }: RecurringAnalyticsCardProps) {
  const theme = useTheme();

  const { estimatedMonthlyCost, upcoming = [] } = recurringSummary;

  if (estimatedMonthlyCost === 0 && upcoming.length === 0) {
    return null;
  }

  return (
    <Card padding={0} radius="xl">
      <View style={{ padding: theme.spacing.lg }}>
        {/* Estimated Monthly Cost Banner */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: theme.colors.surfaceMuted,
            padding: theme.spacing.md,
            borderRadius: theme.radius.lg,
            borderWidth: theme.layout.hairline,
            borderColor: theme.colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="repeat" size={18} color={theme.colors.brand} />
            <Text variant="labelSm" tone="secondary">
              Est. Monthly Recurring
            </Text>
          </View>
          <Text variant="h3" tone="primary">
            {formatINR(estimatedMonthlyCost)}
          </Text>
        </View>

        {/* Upcoming list */}
        {upcoming.length > 0 ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 0.5, marginBottom: 4 }}>
              UPCOMING THIS MONTH
            </Text>
            {upcoming.slice(0, 5).map((item, index) => (
              <Fragment key={item.id}>
                {index > 0 ? <Divider /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: theme.spacing.sm,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="label" numberOfLines={1}>
                      {item.merchant || item.categoryName || 'Subscription'}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      Due {item.dueDate}
                    </Text>
                  </View>
                  <Text variant="labelSm" numberOfLines={1}>
                    {formatINR(item.amount)}
                  </Text>
                </View>
              </Fragment>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
