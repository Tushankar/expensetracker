import { Fragment } from 'react';
import { View } from 'react-native';

import type { TopMerchant } from '@/api/types';
import { Card, Divider, MerchantAvatar, Text } from '@/components/ui';
import { merchantDomain } from '@/data/merchants';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';

export type TopMerchantsCardProps = {
  merchants: TopMerchant[];
  totalExpenses?: number;
};

export function TopMerchantsCard({ merchants, totalExpenses = 0 }: TopMerchantsCardProps) {
  const theme = useTheme();

  if (!merchants || merchants.length === 0) {
    return null;
  }

  return (
    <Card padding={0} radius="xl">
      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        {merchants.map((item, index) => {
          const share = totalExpenses > 0 ? Math.round((item.totalSpent / totalExpenses) * 100) : null;
          return (
            <Fragment key={`top-merchant-${item.merchant || index}-${index}`}>
              {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
              <View
                accessible
                accessibilityLabel={`${item.merchant}, ${formatINR(item.totalSpent)}, ${item.count} transactions`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  paddingVertical: theme.spacing.md,
                }}
              >
                <MerchantAvatar
                  name={item.merchant}
                  domain={merchantDomain(item.merchant)}
                  size={36}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="label" numberOfLines={1}>
                    {item.merchant}
                  </Text>
                  <Text variant="caption" tone="tertiary" numberOfLines={1}>
                    {item.count} {item.count === 1 ? 'transaction' : 'transactions'}
                    {share !== null ? `  ·  ${share}% of spend` : ''}
                  </Text>
                </View>
                <Text variant="labelSm" numberOfLines={1}>
                  {formatINR(item.totalSpent)}
                </Text>
              </View>
            </Fragment>
          );
        })}
      </View>
    </Card>
  );
}
