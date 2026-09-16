import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Fragment, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ActivitySummaryCard } from '@/components/activity/ActivitySummaryCard';
import { TransactionItem } from '@/components/home';
import {
  Card,
  ChipRow,
  Divider,
  EmptyState,
  IconButton,
  PageHeader,
  PillButton,
  Screen,
  Text,
  type Chip,
} from '@/components/ui';
import { dailySpend, monthSummary, recentTransactions } from '@/data/mock';
import { useTheme } from '@/theme';
import type { Transaction } from '@/types/models';
import { formatINR } from '@/utils/currency';
import { groupByDay, monthLabel, monthLabelShort } from '@/utils/date';

type Filter = 'all' | 'income' | 'expenses' | 'subscriptions';

const FILTERS: readonly Chip<Filter>[] = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'subscriptions', label: 'Subscriptions' },
];

/** Lines a divider up with the row text rather than its avatar. */
const DIVIDER_INSET = 40 + 10;

function matches(transaction: Transaction, filter: Filter): boolean {
  switch (filter) {
    case 'income':
      return transaction.kind === 'income';
    case 'expenses':
      return transaction.kind !== 'income';
    case 'subscriptions':
      return transaction.recurring === true;
    default:
      return true;
  }
}

/**
 * Activity: every transaction, grouped by day, with the day's net movement in the
 * heading.
 *
 * A ScrollView is fine for one month of static data. This becomes a SectionList
 * once the list is paginated from the API.
 */
export function TransactionsScreen() {
  const theme = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();

  const [filter, setFilter] = useState<Filter>('all');

  const contentWidth =
    Math.min(width, theme.layout.maxContentWidth) - theme.layout.screenGutter * 2;

  const groups = useMemo(
    () => groupByDay(recentTransactions.filter((transaction) => matches(transaction, filter))),
    [filter],
  );

  return (
    <Screen bottomInset={tabBarHeight + theme.spacing.lg} testID="transactions-screen">
      <PageHeader
        title="Activity"
        subtitle="Track your spending, in one place"
        action={
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <IconButton name="search" accessibilityLabel="Search transactions" variant="surface" />
            <IconButton name="more" accessibilityLabel="More options" variant="surface" />
          </View>
        }
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.lg,
        }}
      >
        <ChipRow
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          size="sm"
          accessibilityLabel="Filter transactions"
          style={{ flex: 1, minWidth: 0 }}
        />
        {/* Only the current month exists in the sample data, so this is a label for
            now — it wires to a picker with the API. */}
        <PillButton
          label={monthLabelShort(monthSummary.month)}
          leftIcon="calendar"
          rightIcon="chevronDown"
          accessibilityLabel={`Period, ${monthLabel(monthSummary.month)}`}
        />
      </View>

      <ActivitySummaryCard summary={monthSummary} daily={dailySpend} width={contentWidth} />

      <View style={{ height: theme.spacing.xxl }} />

      {groups.length === 0 ? (
        <EmptyState
          fill
          icon="list"
          title="Nothing here"
          description="No transactions match this filter. Try a different one."
        />
      ) : (
        groups.map((group) => {
          // Income and expenses cancel out on purpose: the day total is the net
          // movement, which is the number that matches someone's mental arithmetic.
          const net = group.items.reduce(
            (total, transaction) =>
              transaction.kind === 'income'
                ? total + transaction.amount
                : total - transaction.amount,
            0,
          );

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
                <Text variant="caption" tone="tertiary">
                  {formatINR(net, { signed: true, negative: net < 0 })}
                </Text>
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
                      <TransactionItem transaction={transaction} variant="detailed" />
                    </Fragment>
                  ))}
                </View>
              </Card>
            </View>
          );
        })
      )}
    </Screen>
  );
}
