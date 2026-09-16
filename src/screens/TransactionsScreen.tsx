import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';

import {
  useAccountMap,
  useCategoryMap,
  useDailySpend,
  useSummary,
  useTransactionList,
  type PaymentMethod,
  type Transaction,
  type TransactionType,
} from '@/api';
import { ActivitySummaryCard } from '@/components/activity/ActivitySummaryCard';
import { QueryState } from '@/components/data/QueryState';
import { TransactionCalendar, TransactionGroups } from '@/components/transactions';
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
import { DateRangeSheet } from '@/screens/sheets/DateRangeSheet';
import { FiltersSheet, type Filters } from '@/screens/sheets/FiltersSheet';
import { useUiStore } from '@/store/uiStore';
import { useTheme } from '@/theme';
import type { PeriodSummary } from '@/types/models';
import { dayKeyOf, periodRange, type PeriodSelection } from '@/utils/period';

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
  const [selection, setSelection] = useState<PeriodSelection>({ period: 'month' });
  /**
   * List or calendar.
   *
   * The same transactions either way — the calendar is a second way in, for the
   * question a list answers badly: "what did I actually spend on the 14th?"
   */
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [day, setDay] = useState(() => new Date());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeSession, setRangeSession] = useState(0);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Bumped on open and used as the sheet's `key`, so its draft is seeded from the
  // filters currently in force rather than copied in by an effect.
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

  /** The visible calendar month, which is its own window regardless of the period. */
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
      // In calendar mode the window is the selected day instead.
      ...(debounced
        ? {}
        : view === 'calendar'
          ? dayRange
          : { from: range.from, to: range.to }),
      sort: filters.sort ?? ('-date' as const),
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

  function openTransaction(transaction: Transaction) {
    navigation.navigate('TransactionDetail', { id: transaction.id });
  }

  function clearEverything() {
    setKind('all');
    setSearch('');
    setDebounced('');
    setFilters(EMPTY_FILTERS);
    setSearching(false);
    setSelection({ period: 'month' });
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
                name={view === 'calendar' ? 'list' : 'calendar'}
                accessibilityLabel={
                  view === 'calendar' ? 'Show the list' : 'Show the calendar'
                }
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
            // In calendar mode the day picker *is* the period control, so the
            // month pill beside it would be two answers to one question.
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
        key={`range-${rangeSession}`}
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
