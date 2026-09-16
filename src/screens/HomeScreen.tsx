import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { RefreshControl, useWindowDimensions, View } from 'react-native';

import {
  useAccounts,
  useCategoryMap,
  useSummary,
  useTransactionList,
  type Category,
  type Transaction,
} from '@/api';
import { QueryState } from '@/components/data/QueryState';
import {
  BalanceCard,
  GreetingHeader,
  HeaderGlow,
  QuickActions,
  SavingsCard,
  SpendingOverview,
  type Period,
} from '@/components/home';
import { TransactionRow } from '@/components/transactions';
import { Card, Divider, Screen, SectionHeader, Skeleton, SkeletonRow } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { categoryColor, useTheme, type ActionHue } from '@/theme';
import type { CategorySlice, PeriodSummary } from '@/types/models';
import { periodRange } from '@/utils/period';

/** Enough rows to show the shape of the month without turning Home into a ledger. */
const RECENT_COUNT = 5;

/** Lines a divider up with the row text rather than its icon tile. */
const DIVIDER_INSET = 44 + 12;

/**
 * The five bands the spending donut names, in legend order; everything else folds
 * into "Others". A fixed count reads the same way month to month, which a
 * top-N-that-varies list would not.
 */
const HEADLINE_SLICES = 5;

/**
 * Home.
 *
 * Reading order is deliberate: who you are, what you have, what you kept, where it
 * went, what you might do next, then what just happened. Each block answers one
 * question, so nothing needs a second glance.
 */
export function HomeScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();

  const user = useAuthStore((state) => state.user);
  const openAddSheet = useUiStore((state) => state.openAddSheet);

  const [period, setPeriod] = useState<Period>('month');
  const range = useMemo(() => periodRange(period), [period]);

  const accountsQuery = useAccounts();
  const summaryQuery = useSummary({ from: range.from, to: range.to });
  const previousQuery = useSummary({ from: range.previousFrom, to: range.previousTo });
  const recentQuery = useTransactionList({ limit: RECENT_COUNT });
  const categories = useCategoryMap();

  const contentWidth =
    Math.min(width, theme.layout.maxContentWidth) - theme.layout.screenGutter * 2;

  const accounts = accountsQuery.data ?? [];
  const summary = summaryQuery.data;
  const previous = previousQuery.data;

  /**
   * Only active accounts count toward the headline balance. An archived card is
   * still in the data so its history resolves, but adding a closed account's last
   * balance to "what you have" would be wrong.
   */
  const currentBalance = accounts.reduce((total, account) => total + account.balance, 0);

  const periodSummary: PeriodSummary | null = summary
    ? {
        from: range.from,
        to: range.to,
        label: range.label,
        income: summary.income,
        spent: summary.expense,
        saved: summary.net,
        transferred: summary.transferred,
        previousIncome: previous?.income ?? 0,
        previousSpent: previous?.expense ?? 0,
        currentBalance,
      }
    : null;

  const breakdown: CategorySlice[] = useMemo(() => {
    if (!summary || summary.expense === 0) return [];

    const slices = summary.byCategory.map((entry) => {
      const category: Category | undefined = categories.get(entry.categoryId);
      return {
        key: entry.categoryId,
        label: category?.name ?? 'Uncategorised',
        color: categoryColor(category?.color ?? 'other'),
        amount: entry.amount,
        share: entry.amount / summary.expense,
      };
    });

    const headline = slices.slice(0, HEADLINE_SLICES);
    const rest = slices.slice(HEADLINE_SLICES);
    if (rest.length === 0) return headline;

    const othersAmount = rest.reduce((total, slice) => total + slice.amount, 0);
    return [
      ...headline,
      {
        key: 'others',
        label: 'Others',
        color: categoryColor('other'),
        amount: othersAmount,
        share: othersAmount / summary.expense,
      },
    ];
  }, [summary, categories]);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const refreshing =
    summaryQuery.isRefetching || accountsQuery.isRefetching || recentQuery.isRefetching;

  const refresh = useCallback(() => {
    void summaryQuery.refetch();
    void previousQuery.refetch();
    void accountsQuery.refetch();
    void recentQuery.refetch();
  }, [summaryQuery, previousQuery, accountsQuery, recentQuery]);

  function handleQuickAction(key: ActionHue) {
    if (key === 'expense' || key === 'income' || key === 'transfer') {
      openAddSheet(key);
      return;
    }
    navigation.navigate('Tabs', { screen: 'Accounts' });
  }

  function openTransaction(transaction: Transaction) {
    navigation.navigate('TransactionDetail', { id: transaction.id });
  }

  const firstName = user?.name.trim().split(/\s+/)[0] ?? 'there';
  const initials = (user?.name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  // The headline blocks share one loading and one error state: showing a real
  // balance above a broken summary would be more confusing than waiting.
  const headlineError = summaryQuery.error ?? accountsQuery.error;

  return (
    <Screen
      testID="home-screen"
      bottomInset={tabBarHeight + theme.spacing.lg}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={theme.colors.textTertiary}
          colors={[theme.colors.brand]}
          progressBackgroundColor={theme.colors.surface}
        />
      }
    >
      <HeaderGlow width={contentWidth} />

      <View style={{ paddingTop: theme.spacing.sm }}>
        <GreetingHeader
          firstName={firstName}
          initials={initials || 'P'}
          onProfilePress={() => navigation.navigate('Tabs', { screen: 'Settings' })}
          onNotificationsPress={() => navigation.navigate('Tabs', { screen: 'Settings' })}
          onSearchPress={() => navigation.navigate('Tabs', { screen: 'Transactions' })}
        />
      </View>

      <View style={{ marginTop: theme.spacing.xl }}>
        <QueryState
          isLoading={!periodSummary && (summaryQuery.isLoading || accountsQuery.isLoading)}
          error={headlineError}
          onRetry={refresh}
          fill={false}
          loadingFallback={<Skeleton height={232} radius={theme.radius.xl} />}
        >
          {periodSummary ? (
            <>
              <BalanceCard summary={periodSummary} />

              <View style={{ marginTop: theme.spacing.md }}>
                <SavingsCard
                  summary={periodSummary}
                  onPress={() => navigation.navigate('Tabs', { screen: 'Transactions' })}
                />
              </View>

              <View style={{ marginTop: theme.spacing.xxl }}>
                <SpendingOverview
                  summary={periodSummary}
                  breakdown={breakdown}
                  period={period}
                  onPeriodChange={setPeriod}
                  onSeeAll={() => navigation.navigate('Tabs', { screen: 'Transactions' })}
                />
              </View>
            </>
          ) : null}
        </QueryState>
      </View>

      <View style={{ marginTop: theme.spacing.lg }}>
        <QuickActions onAction={handleQuickAction} />
      </View>

      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader
          title="Recent activity"
          actionLabel="See all"
          onActionPress={() => navigation.navigate('Tabs', { screen: 'Transactions' })}
        />

        <Card padding={0} radius="lg">
          <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.xs }}>
            <QueryState
              isLoading={recentQuery.isLoading}
              error={recentQuery.error}
              isEmpty={recentQuery.transactions.length === 0}
              onRetry={() => void recentQuery.refetch()}
              fill={false}
              loadingFallback={
                <View>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </View>
              }
              empty={{
                icon: 'inbox',
                title: 'No transactions yet',
                description: 'Tap the plus button to record your first one.',
                action: { label: 'Add expense', onPress: () => openAddSheet('expense') },
              }}
            >
              {recentQuery.transactions.map((transaction, index) => (
                <Fragment key={transaction.id}>
                  {index > 0 ? <Divider inset={DIVIDER_INSET} /> : null}
                  <TransactionRow
                    transaction={transaction}
                    category={
                      transaction.categoryId ? categories.get(transaction.categoryId) : undefined
                    }
                    account={accountMap.get(transaction.accountId)}
                    destinationAccount={
                      transaction.destinationAccountId
                        ? accountMap.get(transaction.destinationAccountId)
                        : undefined
                    }
                    onPress={openTransaction}
                  />
                </Fragment>
              ))}
            </QueryState>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
