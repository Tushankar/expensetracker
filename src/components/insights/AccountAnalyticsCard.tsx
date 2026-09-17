import { Fragment } from 'react';
import { View } from 'react-native';

import type { AccountAnalytics } from '@/api/types';
import { Card, Divider, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';

export type AccountAnalyticsCardProps = {
  accounts: AccountAnalytics[];
};

export function AccountAnalyticsCard({ accounts }: AccountAnalyticsCardProps) {
  const theme = useTheme();

  // Filter accounts with actual activity in the period
  const activeAccounts = accounts.filter(
    (acc) => acc.spending > 0 || acc.incoming > 0 || acc.transfers > 0,
  );

  if (activeAccounts.length === 0) {
    return null;
  }

  return (
    <Card padding={0} radius="xl">
      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        {activeAccounts.map((acc, index) => (
          <Fragment key={acc.accountId}>
            {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
            <View
              accessible
              accessibilityLabel={`${acc.accountName}, spending ${formatINR(acc.spending)}, incoming ${formatINR(acc.incoming)}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingVertical: theme.spacing.md,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: theme.radius.md,
                  backgroundColor: acc.color ? `${acc.color}20` : theme.colors.surfaceMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name={(acc.icon as any) || 'landmark'}
                  size={18}
                  color={acc.color || theme.colors.brand}
                />
              </View>

              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="label" numberOfLines={1}>
                  {acc.accountName}
                </Text>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                  {acc.incoming > 0 ? (
                    <Text variant="caption" tone="positive">
                      +{formatINR(acc.incoming)}
                    </Text>
                  ) : null}
                  {acc.transfers > 0 ? (
                    <Text variant="caption" tone="tertiary">
                      ↔ {formatINR(acc.transfers)}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text variant="labelSm" tone={acc.spending > 0 ? 'negative' : 'primary'} numberOfLines={1}>
                  {acc.spending > 0 ? `−${formatINR(acc.spending)}` : formatINR(0)}
                </Text>
                <Text variant="caption" tone="tertiary">
                  Spent
                </Text>
              </View>
            </View>
          </Fragment>
        ))}
      </View>
    </Card>
  );
}
