import { useSafeBottomTabBarHeight } from '@/navigation/useSafeTabBarHeight';
import { useNavigation } from '@react-navigation/native';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { useAiSummary, useAnalytics, useMonthlyTrend } from '@/api';
import { PeriodSelector } from '@/components/dashboard';
import { QueryState } from '@/components/data/QueryState';
import { SpendingOverview } from '@/components/home';
import {
  AccountAnalyticsCard,
  AiSummaryCard,
  BudgetAnalyticsCard,
  CalendarSpendingCard,
  FinancialSummaryCard,
  InsightCard,
  PeopleAnalyticsCard,
  RecurringAnalyticsCard,
  SpendingTrendCard,
  TopMerchantsCard,
} from '@/components/insights';
import {
  Card,
  Divider,
  Icon,
  IconButton,
  MerchantAvatar,
  PageHeader,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
} from '@/components/ui';
import { merchantDomain } from '@/data/merchants';
import { DateRangeSheet } from '@/screens/sheets/DateRangeSheet';
import { categoryColor, useTheme } from '@/theme';
import type { CategorySlice } from '@/types/models';
import { toBreakdown } from '@/utils/breakdown';
import { formatINR } from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';
import { tapFeedback } from '@/utils/haptics';
import { periodRange, type Period, type PeriodSelection } from '@/utils/period';

/** Beyond this the bars are hairlines and the labels collide. */
const TREND_MONTHS = 6;

/**
 * Insights: Financial Intelligence, Analytics & AI Assistance.
 *
 * Dedicated Phase C surface presenting verified accounting facts, clear separation
 * of spending vs money movement, breakdowns by category, merchant, account, and budget,
 * accompanied by grounded Groq natural language insights.
 */
export function InsightsScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const tabBarHeight = useSafeBottomTabBarHeight();

  const [selection, setSelection] = useState<PeriodSelection>({ period: 'month' });
  const [periodOffset, setPeriodOffset] = useState(0);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeSession, setRangeSession] = useState(0);

  const referenceDate = useMemo(() => {
    if (periodOffset === 0) return new Date();
    const d = new Date();
    if (selection.period === 'week') {
      d.setDate(d.getDate() + periodOffset * 7);
    } else if (selection.period === 'year') {
      d.setFullYear(d.getFullYear() + periodOffset);
    } else {
      d.setMonth(d.getMonth() + periodOffset);
    }
    return d;
  }, [selection.period, periodOffset]);

  const range = useMemo(() => periodRange(selection, referenceDate), [selection, referenceDate]);

  const window = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      previousFrom: range.previousFrom,
      previousTo: range.previousTo,
      label: range.label,
    }),
    [range],
  );

  const analyticsQuery = useAnalytics(window);
  const trendQuery = useMonthlyTrend(TREND_MONTHS);
  const aiQuery = useAiSummary(window);

  const overview = analyticsQuery.data;

  const breakdown: CategorySlice[] = useMemo(() => {
    if (!overview) return [];

    const categories = overview.categoryBreakdown ?? overview.topCategories;
    const spent = overview.personalExpense ?? overview.totalExpenses;

    return toBreakdown(
      spent,
      categories.map((entry) => ({
        key: entry.categoryId ?? entry.name,
        label: entry.name,
        color: categoryColor(entry.color),
        amount: entry.amount,
      })),
      { othersColor: categoryColor('other') },
    );
  }, [overview]);

  const refresh = useCallback(() => {
    void analyticsQuery.refetch();
    void trendQuery.refetch();
    void aiQuery.refetch();
  }, [analyticsQuery, trendQuery, aiQuery]);

  function openRangeSheet() {
    setRangeSession((current) => current + 1);
    setRangeOpen(true);
  }

  function handlePeriodChange(next: Period) {
    setPeriodOffset(0);
    setSelection({ period: next });
  }

  const movers = (overview?.categoryChanges ?? []).filter((entry) => entry.change !== 0).slice(0, 4);

  return (
    <>
      <Screen
        bottomInset={tabBarHeight + theme.spacing.lg}
        testID="insights-screen"
        refreshControl={
          <RefreshControl
            refreshing={analyticsQuery.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.textTertiary}
            colors={[theme.colors.brand]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
      >
        <PageHeader title="Insights" subtitle="Financial intelligence & analytics" />

        {/* Period Selector & Stepper */}
        <View style={{ gap: theme.spacing.sm }}>
          <PeriodSelector
            value={selection}
            onChange={handlePeriodChange}
            onOpenCustom={openRangeSheet}
            customLabel={range.label}
          />

          {selection.period !== 'custom' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: theme.spacing.xs,
                marginTop: 2,
              }}
            >
              <IconButton
                name="chevronLeft"
                size="sm"
                accessibilityLabel="Previous period"
                onPress={() => {
                  tapFeedback();
                  setPeriodOffset((prev) => prev - 1);
                }}
              />
              <Pressable
                onPress={() => {
                  tapFeedback();
                  setPeriodOffset(0);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.xs,
                  borderRadius: theme.radius.pill,
                  backgroundColor: periodOffset !== 0 ? theme.colors.brandSurface : 'transparent',
                }}
              >
                <Text variant="labelSm" tone={periodOffset !== 0 ? 'brand' : 'secondary'}>
                  {range.label}
                </Text>
                {periodOffset !== 0 ? (
                  <Text variant="caption" tone="brand">
                    (Reset)
                  </Text>
                ) : null}
              </Pressable>
              <IconButton
                name="chevronRight"
                size="sm"
                accessibilityLabel="Next period"
                onPress={() => {
                  tapFeedback();
                  setPeriodOffset((prev) => prev + 1);
                }}
              />
            </View>
          ) : null}
        </View>

        {/* AI Period Summary Card */}
        <View style={{ marginTop: theme.spacing.lg }}>
          <AiSummaryCard
            summary={aiQuery.data?.summary}
            loading={aiQuery.isLoading}
            error={aiQuery.error}
            onRetry={() => void aiQuery.refetch()}
            onAsk={() => navigation.navigate('AiChat')}
          />
        </View>

        <View style={{ marginTop: theme.spacing.xl }}>
          <QueryState
            isLoading={analyticsQuery.isLoading}
            error={analyticsQuery.error}
            isEmpty={overview?.transactionCount === 0 && (!overview?.moneyLent && !overview?.moneyBorrowed)}
            onRetry={refresh}
            loadingFallback={
              <View style={{ gap: theme.spacing.md }}>
                <Skeleton height={140} radius={theme.radius.xl} />
                <Skeleton height={110} radius={theme.radius.xl} />
                <Skeleton height={200} radius={theme.radius.xl} />
                <Skeleton height={140} radius={theme.radius.xl} />
              </View>
            }
            empty={{
              icon: 'barChart',
              title: 'Nothing to analyse yet',
              description:
                'Record a few transactions or obligations and this fills with deep financial intelligence.',
            }}
          >
            {overview ? (
              <>
                {/* 1. Financial Summary: Personal Spending vs Income vs Cash Flow vs Movement */}
                <SectionHeader title="Financial summary" />
                <FinancialSummaryCard overview={overview} />


                {/* AI Observations / What stands out */}
                {aiQuery.data && aiQuery.data.insights.length > 0 ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader title="What stands out" />
                    <View style={{ gap: theme.spacing.md }}>
                      {aiQuery.data.insights.map((insight, index) => (
                        <InsightCard key={`${insight.title}-${index}`} insight={insight} />
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* 2. Spending Trend (Daily / Weekly with Total, Average, Peak Day) */}
                <View style={{ marginTop: theme.spacing.xxl }}>
                  <SectionHeader title="Spending trend" />
                  <SpendingTrendCard overview={overview} periodType={selection.period as any} />
                </View>

                {/* 3. Spending by Category */}
                <View style={{ marginTop: theme.spacing.xxl }}>
                  <SpendingOverview
                    spent={overview.personalExpense ?? overview.totalExpenses}
                    breakdown={breakdown}
                    onSeeAll={() => navigation.navigate('Tabs', { screen: 'Transactions' })}
                    onCategoryPress={() => navigation.navigate('Tabs', { screen: 'Transactions' })}
                  />
                </View>

                {/* 4. Top Merchants */}
                {overview.topMerchants && overview.topMerchants.length > 0 ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader title="Top merchants" />
                    <TopMerchantsCard
                      merchants={overview.topMerchants}
                      totalExpenses={overview.personalExpense ?? overview.totalExpenses}
                    />
                  </View>
                ) : null}

                {/* 5. Budget Analytics */}
                {overview.budgetStatus?.hasBudgets ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader
                      title={`Budgets (${overview.budgetStatus.month})`}
                      actionLabel="Manage"
                      onActionPress={() => navigation.navigate('Tabs', { screen: 'Budgets' })}
                    />
                    <BudgetAnalyticsCard budgetStatus={overview.budgetStatus} />
                  </View>
                ) : null}

                {/* 6. People / Money Owed Analytics */}
                {overview.peopleSummary ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader
                      title="People & obligations"
                      actionLabel="View all"
                      onActionPress={() => navigation.navigate('People')}
                    />
                    <PeopleAnalyticsCard
                      peopleSummary={overview.peopleSummary}
                      onViewAll={() => navigation.navigate('People')}
                      onPersonPress={(personId) => navigation.navigate('PersonDetail', { id: personId })}
                    />
                  </View>
                ) : null}

                {/* 7. Account Analytics */}
                {overview.accountBreakdown && overview.accountBreakdown.length > 0 ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader
                      title="Money movement by account"
                      actionLabel="Accounts"
                      onActionPress={() => navigation.navigate('Accounts')}
                    />
                    <AccountAnalyticsCard accounts={overview.accountBreakdown} />
                  </View>
                ) : null}

                {/* 8. Recurring Expense Analytics */}
                {overview.recurringSummary ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader
                      title="Recurring expenses"
                      actionLabel="Manage"
                      onActionPress={() => navigation.navigate('Recurring')}
                    />
                    <RecurringAnalyticsCard recurringSummary={overview.recurringSummary} />
                  </View>
                ) : null}

                {/* 9. Calendar Spending View */}
                {overview.daily && overview.daily.length > 0 ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader title="Calendar spending" />
                    <CalendarSpendingCard
                      daily={overview.daily}
                      onDatePress={() => navigation.navigate('Tabs', { screen: 'Transactions' })}
                    />
                  </View>
                ) : null}

                {/* 10. Biggest Changes vs Previous Period */}
                {movers.length > 0 ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader title="Biggest changes" />
                    <Card padding={0} radius="xl">
                      <View style={{ paddingHorizontal: theme.spacing.lg }}>
                        {movers.map((entry, index) => (
                          <Fragment key={`mover-${entry.categoryId || entry.name || index}-${index}`}>
                            {index > 0 ? <Divider /> : null}
                            <View
                              accessible
                              accessibilityLabel={`${entry.name}, ${formatINR(entry.current)} now, ${formatINR(entry.previous)} before`}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: theme.spacing.md,
                                paddingVertical: theme.spacing.md,
                              }}
                            >
                              <Icon
                                name={entry.change > 0 ? 'trendingUp' : 'trendingDown'}
                                size={17}
                                color={
                                  entry.change > 0 ? theme.colors.negative : theme.colors.positive
                                }
                                strokeWidth={2.2}
                              />
                              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                <Text variant="label" numberOfLines={1}>
                                  {entry.name}
                                </Text>
                                <Text variant="caption" tone="tertiary" numberOfLines={1}>
                                  {`${formatINR(entry.previous)} → ${formatINR(entry.current)}`}
                                </Text>
                              </View>
                              <Text
                                variant="labelSm"
                                color={
                                  entry.change > 0 ? theme.colors.negative : theme.colors.positive
                                }
                                numberOfLines={1}
                              >
                                {`${entry.change > 0 ? '+' : '−'}${formatINR(Math.abs(entry.change))}`}
                              </Text>
                            </View>
                          </Fragment>
                        ))}
                      </View>
                    </Card>
                  </View>
                ) : null}

                {/* 11. Largest Single Expenses */}
                {overview.largestExpenses.length > 0 ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader title="Largest expenses" />
                    <Card padding={0} radius="xl">
                      <View style={{ paddingHorizontal: theme.spacing.lg }}>
                        {overview.largestExpenses.map((entry, index) => (
                          <Fragment key={`largest-${entry.id || index}-${index}`}>
                            {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
                            <View
                              accessible
                              accessibilityLabel={`${entry.merchant}, ${formatINR(entry.amount)}, ${formatDayLabel(entry.date)}`}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: theme.spacing.md,
                                paddingVertical: theme.spacing.md,
                              }}
                            >
                              <MerchantAvatar
                                name={entry.merchant}
                                domain={merchantDomain(entry.merchant)}
                                size={36}
                              />
                              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                <Text variant="label" numberOfLines={1}>
                                  {entry.merchant}
                                </Text>
                                <Text variant="caption" tone="tertiary" numberOfLines={1}>
                                  {[entry.categoryName, formatDayLabel(entry.date)]
                                    .filter(Boolean)
                                    .join('  ·  ')}
                                </Text>
                              </View>
                              <Text variant="labelSm" numberOfLines={1}>
                                {formatINR(entry.amount)}
                              </Text>
                            </View>
                          </Fragment>
                        ))}
                      </View>
                    </Card>
                  </View>
                ) : null}
              </>
            ) : null}
          </QueryState>
        </View>
      </Screen>

      <DateRangeSheet
        key={`insights-range-sheet-${rangeSession}`}
        visible={rangeOpen}
        value={selection}
        onClose={() => setRangeOpen(false)}
        onApply={(next) => {
          setPeriodOffset(0);
          setSelection(next);
          setRangeOpen(false);
        }}
      />
    </>
  );
}
