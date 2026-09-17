import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { useAiSummary, useAnalytics, useMonthlyTrend } from '@/api';
import { BarChart } from '@/components/charts';
import { PeriodSelector } from '@/components/dashboard';
import { QueryState } from '@/components/data/QueryState';
import { SpendingOverview } from '@/components/home';
import { AiSummaryCard, InsightCard, StatGrid } from '@/components/insights';
import {
  Card,
  Divider,
  Icon,
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
import { formatCompactINR, formatINR } from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';
import { periodRange, type Period, type PeriodSelection } from '@/utils/period';

/** Beyond this the bars are hairlines and the labels collide. */
const TREND_MONTHS = 6;

/**
 * Insights: the analysis, and the assistant that reads it aloud.
 *
 * The order is deliberate — the figures come first and the assistant's wording
 * sits among them, not above them. Everything the assistant says is computed by
 * the server from this same data, and the server refuses to pass on any figure it
 * did not calculate, so the prose and the numbers below it can never disagree.
 */
export function InsightsScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();

  const [selection, setSelection] = useState<PeriodSelection>({ period: 'month' });
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeSession, setRangeSession] = useState(0);

  const range = useMemo(() => periodRange(selection), [selection]);

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

    // The endpoint returns only the top few categories, so the remainder here is
    // taken from the period total rather than from the tail of this list — see
    // the note in `toBreakdown`.
    return toBreakdown(
      overview.totalExpenses,
      overview.topCategories.map((entry) => ({
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
        <PageHeader title="Insights" subtitle="What the numbers say" />

        <PeriodSelector
          value={selection}
          onChange={(period: Period) => setSelection({ period })}
          onOpenCustom={openRangeSheet}
          customLabel={range.label}
        />

        <View style={{ marginTop: theme.spacing.xl }}>
          <AiSummaryCard
            summary={aiQuery.data?.summary}
            loading={aiQuery.isLoading}
            error={aiQuery.error}
            onRetry={() => void aiQuery.refetch()}
            onAsk={() => navigation.navigate('AiChat')}
          />
        </View>

        <View style={{ marginTop: theme.spacing.xxl }}>
          <QueryState
            isLoading={analyticsQuery.isLoading}
            error={analyticsQuery.error}
            isEmpty={overview?.transactionCount === 0}
            onRetry={refresh}
            loadingFallback={
              <View style={{ gap: theme.spacing.md }}>
                <Skeleton height={96} radius={theme.radius.lg} />
                <Skeleton height={96} radius={theme.radius.lg} />
                <Skeleton height={200} radius={theme.radius.xl} />
              </View>
            }
            empty={{
              icon: 'barChart',
              title: 'Nothing to analyse yet',
              description:
                'Record a few transactions and this fills in with where your money actually goes.',
            }}
          >
            {overview ? (
              <>
                <StatGrid overview={overview} />

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

                <View style={{ marginTop: theme.spacing.xxl }}>
                  <SpendingOverview spent={overview.totalExpenses} breakdown={breakdown} />
                </View>

                {overview.weekly.length > 1 ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader title="By week" />
                    <Card radius="xl" padding="xl">
                      <BarChart
                        data={overview.weekly.map((bucket) => ({
                          label: bucket.label,
                          value: bucket.expense,
                        }))}
                        color={theme.colors.brand}
                        height={96}
                        gap={8}
                        formatValue={formatCompactINR}
                        accessibilityLabel={`Spending by week: ${overview.weekly
                          .map((bucket) => `${bucket.label} ${formatINR(bucket.expense)}`)
                          .join(', ')}`}
                      />
                    </Card>
                  </View>
                ) : null}

                {movers.length > 0 ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader title="Biggest changes" />
                    <Card padding={0} radius="xl">
                      <View style={{ paddingHorizontal: theme.spacing.lg }}>
                        {movers.map((entry, index) => (
                          <Fragment key={entry.categoryId ?? entry.name}>
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

                {overview.largestExpenses.length > 0 ? (
                  <View style={{ marginTop: theme.spacing.xxl }}>
                    <SectionHeader title="Largest expenses" />
                    <Card padding={0} radius="xl">
                      <View style={{ paddingHorizontal: theme.spacing.lg }}>
                        {overview.largestExpenses.map((entry, index) => (
                          <Fragment key={entry.id}>
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

        {/* The trend is its own window — six months regardless of the period
            above, because "am I spending more than I used to" is not a question
            about the week you happen to be looking at. */}
        {trendQuery.data && trendQuery.data.some((bucket) => bucket.expense > 0) ? (
          <View style={{ marginTop: theme.spacing.xxl }}>
            <SectionHeader title="Last 6 months" />
            <Card radius="xl" padding="xl">
              <BarChart
                data={trendQuery.data.map((bucket) => ({
                  label: bucket.label,
                  value: bucket.expense,
                }))}
                color={theme.colors.brandText}
                height={110}
                gap={8}
                formatValue={formatCompactINR}
                accessibilityLabel={`Monthly spending: ${trendQuery.data
                  .map((bucket) => `${bucket.label} ${formatINR(bucket.expense)}`)
                  .join(', ')}`}
              />
            </Card>
          </View>
        ) : null}
      </Screen>

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
