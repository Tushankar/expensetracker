import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, View } from 'react-native';

import {
  useAccountMap,
  useCategoryMap,
  useDailySpend,
  useSummary,
  useTransactionList,
  type Transaction,
  type TransactionFilters,
} from '@/api';
import { ActivitySummaryCard } from '@/components/activity/ActivitySummaryCard';
import { QueryState } from '@/components/data/QueryState';
import {
  TransactionCalendar,
  TransactionListItem,
  TransactionSectionHeader,
  buildTransactionSections,
} from '@/components/transactions';
import {
  Badge,
  ChipRow,
  IconButton,
  Input,
  PageHeader,
  PillButton,
  Screen,
  SkeletonRow,
  Text,
} from '@/components/ui';
import { DateRangeSheet } from '@/screens/sheets/DateRangeSheet';
import { FiltersSheet } from '@/screens/sheets/FiltersSheet';
import { useUiStore } from '@/store/uiStore';
import { useTheme } from '@/theme';
import type { PeriodSummary } from '@/types/models';
import { dayKeyOf, periodRange, type PeriodSelection } from '@/utils/period';

type Kind = 'all' | 'expense' | 'income' | 'transfer';

const KINDS: readonly { value: Kind; label: string }[] = [
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

const EMPTY_FILTERS: TransactionFilters = {};

/**
 * Activity: every transaction, grouped by day, with search, filters and paging.
 *
 * The filters live in the query rather than in a `.filter()` over loaded rows.
 * Filtering client-side would only ever search the pages that happen to be in
 * memory, so "show me everything over ₹5,000" would quietly mean "…in the last 25
 * transactions", which is the kind of wrong that looks right.
 *
 * The list is virtualised. A year of spending is a few thousand rows, and mounting
 * all of them to show twelve is how a list that felt fine in testing becomes a
 * scroll that drops frames on the phones this app is actually for.
 */
export function TransactionsScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();

  const openAddSheet = useUiStore((state) => state.openAddSheet);

  const [kind, setKind] = useState<Kind>('all');
  const [selection, setSelection] = useState<PeriodSelection>({ period: 'month' });
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [day, setDay] = useState(() => new Date());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeSession, setRangeSession] = useState(0);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersSession, setFiltersSession] = useState(0);

  function openFilters() {
    setFiltersSession((current) => current + 1);
    setFiltersOpen(true);
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const range = useMemo(() => periodRange(selection), [selection]);

  const calendarRange = useMemo(() => {
    const from = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1, 0, 0, 0, 0);
    const to = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    return { from: from.toISOString(), to: to.toISOString() };
  }, [calendarMonth]);

  const dayRange = useMemo(() => {
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [day]);

  const query: TransactionFilters = useMemo(
    () => ({
      ...(kind === 'all' ? {} : { type: kind }),
      ...(debounced ? { q: debounced } : {}),
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
      ...(filters.minAmount !== undefined ? { minAmount: filters.minAmount } : {}),
      ...(filters.maxAmount !== undefined ? { maxAmount: filters.maxAmount } : {}),
      // A search deliberately ignores the period: someone looking for "Swiggy"
      // wants it wherever it happened, not only inside whatever month the chip
      // happens to be showing.
      ...(debounced ? {} : view === 'calendar' ? dayRange : { from: range.from, to: range.to }),
      sort: filters.sort ?? '-date',
    }),
    [kind, debounced, filters, range, view, dayRange],
  );

  const list = useTransactionList(query);
  const dailyQuery = useDailySpend(calendarRange);
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
    void dailyQuery.refetch();
  }, [list, summaryQuery, previousQuery, dailyQuery]);

  function openRangeSheet() {
    setRangeSession((current) => current + 1);
    setRangeOpen(true);
  }

  const selectedDayKey = dayKeyOf(day);
  const selectedDay = (dailyQuery.data ?? []).find((entry) => entry.date === selectedDayKey);

  // Stable, so the memoised rows do not all re-render when anything else on this
  // screen changes — which is the entire point of memoising them.
  const openTransaction = useCallback(
    (transaction: Transaction) => {
      navigation.navigate('TransactionDetail', { id: transaction.id });
    },
    [navigation],
  );

  const clearEverything = useCallback(() => {
    setKind('all');
    setSearch('');
    setDebounced('');
    setFilters(EMPTY_FILTERS);
    setSearching(false);
    setSelection({ period: 'month' });
  }, []);

  const sections = useMemo(
    () => buildTransactionSections(list.transactions),
    [list.transactions],
  );

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = list;

  /**
   * Fetches the next page as the end comes into view.
   *
   * Guarded on `hasNextPage` and on a fetch not already being in flight, because
   * `onEndReached` fires again on every layout pass while the threshold is
   * crossed — without the guard a fast scroll to the bottom asks for page two
   * four times.
   */
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const header = (
    <View>
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
              name={view === 'calendar' ? 'list' : 'calendar'}
              accessibilityLabel={view === 'calendar' ? 'Show the list' : 'Show the calendar'}
              accessibilityHint={
                view === 'calendar'
                  ? 'Goes back to every transaction in the period'
                  : 'Browses transactions a day at a time'
              }
              variant="surface"
              onPress={() => {
                setView((current) => (current === 'list' ? 'calendar' : 'list'));
                setSearching(false);
                setSearch('');
                setDebounced('');
              }}
            />
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
                onPress={openFilters}
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
          // In calendar mode the day picker *is* the period control, so the month
          // pill beside it would be two answers to one question.
          display: view === 'calendar' ? 'none' : 'flex',
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
          onPress={openRangeSheet}
        />
      </View>

      {view === 'calendar' ? (
        <View style={{ marginBottom: theme.spacing.xxl }}>
          <TransactionCalendar
            days={dailyQuery.data ?? []}
            selected={day}
            onSelect={setDay}
            onMonthChange={setCalendarMonth}
            selectedCount={selectedDay?.count ?? 0}
            selectedSpend={selectedDay?.expense ?? 0}
          />
        </View>
      ) : debounced ? (
        <View style={{ marginBottom: theme.spacing.lg }}>
          <Badge label={`Searching all time for "${debounced}"`} tone="brand" />
        </View>
      ) : periodSummary ? (
        <View style={{ marginBottom: theme.spacing.xxl }}>
          <ActivitySummaryCard summary={periodSummary} />
        </View>
      ) : null}
    </View>
  );

  const footer =
    list.transactions.length === 0 ? null : hasNextPage ? (
      <View style={{ paddingVertical: theme.spacing.xl, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={theme.colors.textTertiary} />
      </View>
    ) : (
      <Text
        variant="caption"
        tone="tertiary"
        align="center"
        style={{ paddingVertical: theme.spacing.xl }}
      >
        That is everything.
      </Text>
    );

  return (
    <>
      <Screen scroll={false} bottomInset={0} testID="transactions-screen">
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <TransactionSectionHeader label={section.label} net={section.net} />
          )}
          renderItem={({ item, index, section }) => (
            <TransactionListItem
              transaction={item}
              category={item.categoryId ? categories.get(item.categoryId) : undefined}
              account={accounts.get(item.accountId)}
              destinationAccount={
                item.destinationAccountId ? accounts.get(item.destinationAccountId) : undefined
              }
              first={index === 0}
              last={index === section.data.length - 1}
              onPress={openTransaction}
            />
          )}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={
            <QueryState
              isLoading={list.isLoading}
              error={list.error}
              isEmpty
              onRetry={refresh}
              fill={false}
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
                      action: {
                        label: 'Clear all',
                        onPress: clearEverything,
                        variant: 'secondary',
                      },
                    }
                  : view === 'calendar'
                    ? {
                        icon: 'calendar',
                        title: 'Nothing on this day',
                        description: 'Pick another date, or add something for this one.',
                        action: { label: 'Add expense', onPress: () => openAddSheet('expense') },
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
              {null}
            </QueryState>
          }
          stickySectionHeadersEnabled
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: tabBarHeight + theme.spacing.xxxl,
          }}
          // Tuned for rows of a known, uniform-ish height. The defaults render far
          // more off-screen than a ledger needs and make the first paint slower
          // than the data it is waiting on.
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={list.isRefetching && !list.isFetchingNextPage}
              onRefresh={refresh}
              tintColor={theme.colors.textTertiary}
              colors={[theme.colors.brand]}
              progressBackgroundColor={theme.colors.surface}
            />
          }
        />
      </Screen>

      <FiltersSheet
        key={filtersSession}
        visible={filtersOpen}
        value={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
        }}
      />

      <DateRangeSheet
        key={rangeSession}
        visible={rangeOpen}
        value={selection}
        onClose={() => setRangeOpen(false)}
        onApply={(next) => {
          setSelection(next);
          setRangeOpen(false);
        }}
      />
    </>
  );
}
