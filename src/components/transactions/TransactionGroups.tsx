import { Fragment, useMemo } from 'react';
import { View } from 'react-native';

import type { Account, Category, Transaction } from '@/api/types';
import { Card, Divider, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';

import { TransactionRow } from './TransactionRow';

export type TransactionGroupsProps = {
  transactions: Transaction[];
  categories: Map<string, Category>;
  accounts: Map<string, Account>;
  onPress: (transaction: Transaction) => void;
};

/** Lines a divider up with the row text rather than its avatar. */
const DIVIDER_INSET = 40 + 10;

/**
 * The ledger, grouped under day headings with each day's net movement.
 *
 * Transfers are excluded from the day total for the same reason they are excluded
 * from the month's: ₹10,000 moving from HDFC to Cash did not change what you have,
 * and a heading that says −₹10,000 would be wrong in a way that undermines every
 * other number on the screen.
 */
export function TransactionGroups({
  transactions,
  categories,
  accounts,
  onPress,
}: TransactionGroupsProps) {
  const theme = useTheme();

  const groups = useMemo(() => {
    const result: { label: string; items: Transaction[] }[] = [];
    for (const transaction of transactions) {
      const label = formatDayLabel(transaction.date);
      const last = result[result.length - 1];
      if (last && last.label === label) last.items.push(transaction);
      else result.push({ label, items: [transaction] });
    }
    return result;
  }, [transactions]);

  return (
    <>
      {groups.map((group) => {
        const net = group.items.reduce((total, transaction) => {
          if (transaction.type === 'income') return total + transaction.amount;
          if (transaction.type === 'expense') return total - transaction.amount;
          return total;
        }, 0);

        return (
          <View key={group.label} style={{ marginBottom: theme.spacing.xl }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
                marginBottom: theme.spacing.sm,
                paddingHorizontal: theme.spacing.xs,
              }}
            >
              <Text variant="overline" tone="tertiary">
                {group.label}
              </Text>
              {net === 0 ? null : (
                <Text variant="caption" tone="tertiary">
                  {formatINR(net, { signed: true, negative: net < 0 })}
                </Text>
              )}
            </View>

            <Card padding={0} radius="lg">
              <View
                style={{
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.xs,
                }}
              >
                {group.items.map((transaction, index) => (
                  <Fragment key={transaction.id}>
                    {index > 0 ? <Divider inset={DIVIDER_INSET} /> : null}
                    <TransactionRow
                      transaction={transaction}
                      variant="detailed"
                      category={
                        transaction.categoryId
                          ? categories.get(transaction.categoryId)
                          : undefined
                      }
                      account={accounts.get(transaction.accountId)}
                      destinationAccount={
                        transaction.destinationAccountId
                          ? accounts.get(transaction.destinationAccountId)
                          : undefined
                      }
                      onPress={onPress}
                    />
                  </Fragment>
                ))}
              </View>
            </Card>
          </View>
        );
      })}
    </>
  );
}
