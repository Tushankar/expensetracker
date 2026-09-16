import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';

import {
  useAccountMap,
  useCategoryMap,
  useSummary,
  useTransactionList,
  type PaymentMethod,
  type Transaction,
  type TransactionType,
} from '@/api';
import { ActivitySummaryCard } from '@/components/activity/ActivitySummaryCard';
import { QueryState } from '@/components/data/QueryState';
import { PERIODS, type Period } from '@/components/home';
import { TransactionGroups } from '@/components/transactions';
import {
  Badge,
  Button,
  ChipRow,
  IconButton,
  Input,
  PageHeader,
  PillButton,
  Screen,
  SkeletonRow,
  Text,
  type Chip,
} from '@/components/ui';
import { FiltersSheet, type Filters } from '@/screens/sheets/FiltersSheet';
import { useUiStore } from '@/store/uiStore';
import { useTheme } from '@/theme';
import type { PeriodSummary } from '@/types/models';
import { periodRange } from '@/utils/period';

type Kind = 'all' | TransactionType;

const KINDS: readonly Chip<Kind>[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfers' },
];

/**
 * How long the app waits after the last keystroke before searching.
 *
 * Fast enough to feel live, slow enough that typing "restaurant" is one request
 * and not ten. React Query aborts the superseded ones either way, but the server
 * should not have to run nine queries nobody will read.
 */
const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_FILTERS: Filters = {};

/**
 * Activity: every transaction, grouped by day, with search, filters and paging.
 *
 * The filters live in the query rather than in a `.filter()` over loaded rows.
 * Filtering client-side would only ever search the pages that happen to be in
 * memory, so "show me everything over ₹5,000" would quietly mean "…in the last 25
 * transactions", which is the kind of wrong that looks right.
 */
export function TransactionsScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const openAddSheet = useUiStore((state) => state.openAddSheet);

  const [kind, setKind] = useState<Kind>('all');
  const [period, setPeriod] = useState<Period>('month');
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const range = useMemo(() => periodRange(period), [period]);

  const query = useMemo(
    () => ({
      ...(kind === 'all' ? {} : { type: kind }),
      ...(debounced ? { q: debounced } : {}),
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod as PaymentMethod } : {}),
      ...(filters.minAmount !== undefined ? { minAmount: filters.minAmount } : {}),
      ...(filters.maxAmount !== undefined ? { maxAmount: filters.maxAmount } : {}),
      // A search is a search of everything — scoping it to the selected month is
      // how people conclude the app "lost" a transaction they know they entered.
      ...(debounced ? {} : { from: range.from, to: range.to }),
      sort: filters.sort ?? ('-date' as const),
    }),
    [kind, debounced, filters, range],
  );

  const list = useTransactionList(query);
  const summaryQuery = useSummary({ from: range.from, to: range.to });
  const previousQuery = useSummary({ from: range.previousFrom, to: range.previousTo });
  const categories = useCategoryMap();
  const accounts = useAccountMap();

  const summary = summaryQuery.data;
  const periodSummary: PeriodSummary | null = summary
    ? {
        from: range.from,
        to: range.to,
        label: range.label,
        income: summary.income,
        spent: summary.expense,
        saved: summary.net,
        transferred: summary.transferred,
        previousIncome: previousQuery.data?.income ?? 0,
        previousSpent: previousQuery.data?.expense ?? 0,
        currentBalance: 0,
      }
    : null;

  const activeFilterCount =
    (filters.accountId ? 1 : 0) +
    (filters.categoryId ? 1 : 0) +
    (filters.paymentMethod ? 1 : 0) +
    (filters.minAmount !== undefined || filters.maxAmount !== undefined ? 1 : 0) +
    (filters.sort && filters.sort !== '-date' ? 1 : 0);

  const filtered = Boolean(debounced) || activeFilterCount > 0 || kind !== 'all';

  const refresh = useCallback(() => {
    void list.refetch();
    void summaryQuery.refetch();
    void previousQuery.refetch();
  }, [list, summaryQuery, previousQuery]);

  function openTransaction(transaction: Transaction) {
    navigation.navigate('TransactionDetail', { id: transaction.id });
  }

  function clearEverything() {
    setKind('all');
    setSearch('');
    setDebounced('');
    setFilters(EMPTY_FILTERS);
    setSearching(false);
  }

  return (
    <>
      <Screen
        bottomInset={tabBarHeight + theme.spacing.lg}
        testID="transactions-screen"
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={refresh}
            tintColor={theme.colors.textTertiary}
            colors={[theme.colors.brand]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
        // Paging happens on scroll rather than behind a "load more" button; the
        // threshold is generous so the next page is usually there before the
        // bottom of the list is.
        contentContainerStyle={undefined}
      >
        <PageHeader
          title="Activity"
          subtitle={
            list.total > 0
              ? `${list.total} ${list.total === 1 ? 'transaction' : 'transactions'}`
              : 'Track your spending, in one place'
          }
          action={
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <IconButton
                name={searching ? 'close' : 'search'}
                accessibilityLabel={searching ? 'Close search' : 'Search transactions'}
                variant="surface"
                onPress={() => {
                  setSearching((current) => !current);
                  if (searching) {
                    setSearch('');
                    setDebounced('');
                  }
                }}
              />
              <View>
                <IconButton
                  name="filter"
                  accessibilityLabel={
                    activeFilterCount > 0
                      ? `Filters, ${activeFilterCount} active`
                      : 'Filter transactions'
                  }
                  variant="surface"
                  onPress={() => setFiltersOpen(true)}
                />
                {activeFilterCount > 0 ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: theme.colors.brand,
                      borderWidth: 2,
                      borderColor: theme.colors.surface,
                    }}
                  />
                ) : null}
              </View>
            </View>
          }
        />

        {searching ? (
          <Input
            placeholder="Search merchant or note"
            value={search}
            onChangeText={setSearch}
            leftIcon="search"
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            containerStyle={{ marginBottom: theme.spacing.lg }}
          />
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            marginBottom: theme.spacing.lg,
          }}
        >
          <ChipRow
            options={KINDS}
            value={kind}
            onChange={setKind}
            size="sm"
            accessibilityLabel="Filter by type"
            style={{ flex: 1, minWidth: 0 }}
          />
          <PillButton
            label={range.label}
            leftIcon="calendar"
            rightIcon="chevronDown"
            accessibilityLabel={`Period, ${range.label}`}
            accessibilityHint="Changes the period shown"
            onPress={() => {
              // Cycles rather than opening a picker: five options, and the chip
              // itself is the affordance.
              const index = PERIODS.findIndex((option) => option.value === period);
              const next = PERIODS[(index + 1) % PERIODS.length];
              if (next) setPeriod(next.value);
            }}
          />
        </View>

        {debounced ? (
          <View style={{ marginBottom: theme.spacing.lg }}>
            <Badge label={`Searching all time for "${debounced}"`} tone="brand" />
          </View>
        ) : periodSummary ? (
          <View style={{ marginBottom: theme.spacing.xxl }}>
            <ActivitySummaryCard summary={periodSummary} />
          </View>
        ) : null}

        <QueryState
          isLoading={list.isLoading}
          error={list.error}
          isEmpty={list.transactions.length === 0}
          onRetry={refresh}
          loadingFallback={
            <View>
              {Array.from({ length: 6 }, (_, index) => (
                <SkeletonRow key={index} />
              ))}
            </View>
          }
          empty={
            filtered
              ? {
                  icon: 'search',
                  title: 'Nothing matches',
                  description: 'No transactions fit these filters. Try widening them.',
                  action: { label: 'Clear all', onPress: clearEverything, variant: 'secondary' },
                }
              : {
                  icon: 'list',
                  title: 'No transactions yet',
                  description:
                    'Record your first expense and it will show up here, grouped by day.',
                  action: { label: 'Add expense', onPress: () => openAddSheet('expense') },
                }
          }
        >
          <TransactionGroups
            transactions={list.transactions}
            categories={categories}
            accounts={accounts}
            onPress={openTransaction}
          />

          {list.hasNextPage ? (
            <View style={{ paddingVertical: theme.spacing.lg, alignItems: 'center' }}>
              {list.isFetchingNextPage ? (
                <ActivityIndicator size="small" color={theme.colors.textTertiary} />
              ) : (
                <Button
                  label="Load more"
                  variant="secondary"
                  size="sm"
                  onPress={() => void list.fetchNextPage()}
                />
              )}
            </View>
          ) : list.transactions.length > 0 ? (
            <Text variant="caption" tone="tertiary" align="center" style={{ paddingVertical: theme.spacing.lg }}>
              That is everything.
            </Text>
          ) : null}
        </QueryState>
      </Screen>

      <FiltersSheet
        visible={filtersOpen}
        value={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
        }}
      />
    </>
  );
}
