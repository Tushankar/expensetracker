import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { useBudgets, useCategories, type BudgetProgress } from '@/api';
import { BudgetRow } from '@/components/budgets/BudgetRow';
import { BudgetStarterView } from '@/components/budgets/BudgetStarterView';
import { MonthSwitcher } from '@/components/budgets/MonthSwitcher';
import { OverallBudgetHero } from '@/components/budgets/OverallBudgetHero';
import { QueryState } from '@/components/data/QueryState';
import {
  Button,
  Card,
  Divider,
  Icon,
  IconButton,
  PageHeader,
  Screen,
  Skeleton,
  Text,
  withAlpha,
} from '@/components/ui';
import { BudgetFormSheet } from '@/screens/sheets/BudgetFormSheet';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { monthLabel } from '@/utils/date';
import { tapFeedback } from '@/utils/haptics';
import { dayFromKey, monthKeyOf } from '@/utils/period';

function shiftMonthKey(key: string, months: number): string {
  const date = dayFromKey(`${key}-01`);
  return monthKeyOf(new Date(date.getFullYear(), date.getMonth() + months, 1));
}

function getMonthDaysInfo(monthKey: string) {
  const parts = monthKey.split('-');
  const year = parseInt(parts[0] ?? '2026', 10);
  const monthIdx = parseInt(parts[1] ?? '1', 10) - 1;
  const now = new Date();
  const totalDays = new Date(year, monthIdx + 1, 0).getDate();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === monthIdx;
  const isPastMonth =
    now.getFullYear() > year || (now.getFullYear() === year && now.getMonth() > monthIdx);
  const currentDay = isCurrentMonth ? now.getDate() : isPastMonth ? totalDays : 1;
  const daysRemaining = isCurrentMonth ? Math.max(1, totalDays - currentDay) : 0;
  return { totalDays, currentDay, daysRemaining, isCurrentMonth };
}

type CategoryFilter = 'all' | 'warning' | 'exceeded' | 'on_track';

/**
 * Budgets: one overall monthly ceiling plus per-category guardrails.
 *
 * The screen is built around a single question — is this month going to land —
 * so the dial answers it first, the category list explains it, and everything
 * that would only restate a figure has been cut.
 */
export function BudgetsScreen() {
  const theme = useTheme();
  const tabBarHeight = useBottomTabBarHeight();

  const [month, setMonth] = useState(() => monthKeyOf(new Date()));
  const [editing, setEditing] = useState<BudgetProgress | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formSession, setFormSession] = useState(0);
  const [formPreset, setFormPreset] = useState<{
    scope?: 'overall' | 'category';
    categoryId?: string;
    amount?: string;
  } | null>(null);
  const [filter, setFilter] = useState<CategoryFilter>('all');

  const query = useBudgets(month);
  const summary = query.data;

  const categoriesQuery = useCategories('expense');
  const allCategories = useMemo(
    () => categoriesQuery.data?.categories ?? [],
    [categoriesQuery.data?.categories],
  );

  const currentMonth = monthKeyOf(new Date());
  const atCurrent = month === currentMonth;
  const label = monthLabel(dayFromKey(`${month}-01`));
  const { totalDays, currentDay, daysRemaining, isCurrentMonth } = useMemo(
    () => getMonthDaysInfo(month),
    [month],
  );

  const budgeted = useMemo(
    () => new Set((summary?.categories ?? []).map((budget) => budget.categoryId ?? '')),
    [summary],
  );

  function openForm(
    budget: BudgetProgress | null,
    preset?: { scope?: 'overall' | 'category'; categoryId?: string; amount?: string },
  ) {
    setEditing(budget);
    setFormPreset(preset ?? null);
    setFormSession((current) => current + 1);
    setFormOpen(true);
  }

  const overall = summary?.overall ?? null;
  const categories = useMemo(() => summary?.categories ?? [], [summary]);
  const hasAny = overall !== null || categories.length > 0;

  const counts = useMemo(
    () => ({
      all: categories.length,
      on_track: categories.filter((budget) => budget.state === 'on_track').length,
      warning: categories.filter((budget) => budget.state === 'warning').length,
      exceeded: categories.filter((budget) => budget.state === 'exceeded').length,
    }),
    [categories],
  );

  const filteredCategories = useMemo(
    () => (filter === 'all' ? categories : categories.filter((budget) => budget.state === filter)),
    [categories, filter],
  );

  // Spend inside the capped categories only. `totals.spent` is the whole month,
  // uncapped categories included, so the two must never be shown as a pair.
  const cappedSpend = useMemo(
    () => categories.reduce((total, budget) => total + budget.spent, 0),
    [categories],
  );

  return (
    <>
      <Screen
        bottomInset={tabBarHeight + theme.spacing.lg}
        testID="budgets-screen"
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.textTertiary}
            colors={[theme.colors.brand]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
      >
        <PageHeader
          title="Budgets"
          subtitle="What you meant to spend"
          action={
            <IconButton
              name="plus"
              accessibilityLabel="Add a budget"
              accessibilityHint="Opens the new budget sheet"
              variant="surface"
              onPress={() => openForm(null)}
            />
          }
        />

        <MonthSwitcher
          label={label}
          isCurrent={atCurrent}
          caption={
            atCurrent
              ? `Day ${currentDay} of ${totalDays} · ${daysRemaining} left`
              : 'Tap to return to this month'
          }
          onPrevious={() => setMonth((current) => shiftMonthKey(current, -1))}
          onNext={() => setMonth((current) => shiftMonthKey(current, 1))}
          onReturn={() => setMonth(currentMonth)}
          style={{ marginBottom: theme.spacing.xl }}
        />

        <QueryState
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          loadingFallback={
            <View style={{ gap: theme.spacing.lg }}>
              <Skeleton height={280} radius={theme.radius.xl} />
              <Skeleton height={72} radius={theme.radius.xl} />
              <Skeleton height={240} radius={theme.radius.xl} />
            </View>
          }
        >
          {!hasAny ? (
            <BudgetStarterView
              categories={allCategories}
              monthLabel={label}
              onCreateCustom={() => openForm(null)}
              onSetOverall={() => openForm(null, { scope: 'overall' })}
              onSelectPreset={(preset) =>
                openForm(null, {
                  scope: 'category',
                  categoryId: preset.categoryId,
                  amount: preset.amount,
                })
              }
            />
          ) : (
            <View style={{ gap: theme.spacing.xxl, paddingBottom: theme.spacing.xxl }}>
              {overall ? (
                <OverallBudgetHero
                  budget={overall}
                  monthLabel={label}
                  daysRemaining={daysRemaining}
                  dayOfMonth={currentDay}
                  totalDays={totalDays}
                  isCurrentMonth={isCurrentMonth}
                  onEdit={() => openForm(overall)}
                />
              ) : (
                <OverallPrompt onPress={() => openForm(null, { scope: 'overall' })} />
              )}

              <View style={{ gap: theme.spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text variant="overline" tone="tertiary">
                      {categories.length === 0
                        ? 'Next step'
                        : `${categories.length} active ${categories.length === 1 ? 'cap' : 'caps'}`}
                    </Text>
                    <Text variant="h3" numberOfLines={1}>
                      Category caps
                    </Text>
                  </View>
                  <Button
                    label="Add cap"
                    leftIcon="plus"
                    variant="tonal"
                    size="sm"
                    onPress={() => openForm(null, { scope: 'category' })}
                  />
                </View>

                {categories.length > 0 ? (
                  <CapsTotals
                    capped={summary?.totals.budgeted ?? 0}
                    used={cappedSpend}
                    headroom={summary?.totals.remaining ?? 0}
                  />
                ) : null}

                {categories.length > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: theme.spacing.xs, paddingVertical: 2 }}
                  >
                    <FilterChip
                      label="All"
                      count={counts.all}
                      active={filter === 'all'}
                      onPress={() => setFilter('all')}
                    />
                    {counts.exceeded > 0 ? (
                      <FilterChip
                        label="Over"
                        count={counts.exceeded}
                        dot={theme.colors.negative}
                        active={filter === 'exceeded'}
                        onPress={() => setFilter('exceeded')}
                      />
                    ) : null}
                    {counts.warning > 0 ? (
                      <FilterChip
                        label="Near cap"
                        count={counts.warning}
                        dot={theme.colors.warning}
                        active={filter === 'warning'}
                        onPress={() => setFilter('warning')}
                      />
                    ) : null}
                    {counts.on_track > 0 ? (
                      <FilterChip
                        label="On track"
                        count={counts.on_track}
                        dot={theme.colors.positive}
                        active={filter === 'on_track'}
                        onPress={() => setFilter('on_track')}
                      />
                    ) : null}
                  </ScrollView>
                ) : null}

                {categories.length === 0 ? (
                  <Card variant="outlined" radius="xl" padding="xl">
                    <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: theme.radius.sm,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: withAlpha(theme.colors.brandText, 0.12),
                        }}
                      >
                        <Icon name="shieldCheck" size={21} color={theme.colors.brandText} />
                      </View>
                      <Text variant="label" align="center">
                        No category limits yet
                      </Text>
                      <Text variant="bodySm" tone="secondary" align="center">
                        A cap on Food, Transport or Shopping is what turns the ceiling
                        above into something you can act on day to day.
                      </Text>
                      <Button
                        label="Add a category cap"
                        leftIcon="plus"
                        variant="brand"
                        size="sm"
                        onPress={() => openForm(null, { scope: 'category' })}
                        style={{ marginTop: theme.spacing.xs }}
                      />
                    </View>
                  </Card>
                ) : filteredCategories.length === 0 ? (
                  <Card variant="muted" radius="xl" padding="lg">
                    <Text variant="bodySm" tone="secondary" align="center">
                      Nothing in this state right now.
                    </Text>
                  </Card>
                ) : (
                  <Card padding={0} radius="xl">
                    <View style={{ paddingHorizontal: theme.spacing.lg }}>
                      {filteredCategories.map((budget, index) => (
                        <Fragment key={budget.id}>
                          {index > 0 ? <Divider /> : null}
                          <BudgetRow budget={budget} onPress={openForm} />
                        </Fragment>
                      ))}
                    </View>
                  </Card>
                )}
              </View>

              {summary && summary.totals.unbudgetedSpend > 0 ? (
                <UnbudgetedBanner
                  amount={summary.totals.unbudgetedSpend}
                  onPress={() => openForm(null, { scope: 'category' })}
                />
              ) : null}
            </View>
          )}
        </QueryState>
      </Screen>

      <BudgetFormSheet
        key={formSession}
        visible={formOpen}
        budget={editing}
        hasOverall={overall !== null}
        budgetedCategoryIds={budgeted}
        initialScope={formPreset?.scope}
        initialCategoryId={formPreset?.categoryId}
        initialAmount={formPreset?.amount}
        onClose={() => {
          setFormOpen(false);
          setFormPreset(null);
        }}
      />
    </>
  );
}

/**
 * Stands in for the hero when only category caps exist. Deliberately shaped like
 * the card it would become, so setting a ceiling looks like filling in a gap
 * rather than adding another thing to the screen.
 */
function OverallPrompt({ onPress }: { onPress: () => void }) {
  const theme = useTheme();

  return (
    <Card variant="outlined" radius="xl" padding="lg" onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brandSurface,
            borderWidth: theme.layout.hairline,
            borderColor: withAlpha(theme.colors.brandText, 0.22),
          }}
        >
          <Icon name="target" size={21} color={theme.colors.brandText} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text variant="label">Set an overall monthly cap</Text>
          <Text variant="caption" tone="secondary">
            One ceiling across every category, with a daily safe-spend figure
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color={theme.colors.textTertiary} />
      </View>
    </Card>
  );
}

/** Capped, used and headroom — all three read off the category caps alone. */
function CapsTotals({
  capped,
  used,
  headroom,
}: {
  capped: number;
  used: number;
  headroom: number;
}) {
  const theme = useTheme();

  return (
    <Card variant="muted" radius="lg" padding="md">
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        <Total label="Capped" value={formatINR(capped)} />
        <Rule />
        <Total label="Used" value={formatINR(used)} />
        <Rule />
        <Total
          label="Headroom"
          value={formatINR(headroom)}
          color={headroom > 0 ? theme.colors.positive : theme.colors.textTertiary}
        />
      </View>
    </Card>
  );
}

function Total({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={{ flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 }}
    >
      <Text variant="caption" tone="tertiary" numberOfLines={1}>
        {label}
      </Text>
      <Text
        variant="amountSm"
        color={color}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
    </View>
  );
}

function Rule() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: theme.layout.hairline,
        height: 26,
        alignSelf: 'center',
        backgroundColor: theme.colors.border,
      }}
    />
  );
}

function UnbudgetedBanner({ amount, onPress }: { amount: number; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Card
      variant="outlined"
      radius="xl"
      padding="lg"
      style={{ borderColor: withAlpha(theme.colors.warning, 0.28) }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.warningSurface,
          }}
        >
          <Icon name="bulb" size={19} color={theme.colors.warning} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text variant="labelSm">Spending outside your caps</Text>
          <Text variant="caption" tone="secondary">
            {`${formatINR(amount)} went to categories with no cap this month.`}
          </Text>
        </View>
        <Button label="Cap it" variant="tonal" size="sm" onPress={onPress} />
      </View>
    </Card>
  );
}

function FilterChip({
  label,
  count,
  dot,
  active,
  onPress,
}: {
  label: string;
  count: number;
  dot?: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const accent = active ? theme.colors.brandText : theme.colors.textSecondary;

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count}`}
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 34,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.pill,
        backgroundColor: active ? theme.colors.brandSurface : theme.colors.surface,
        borderWidth: theme.layout.hairline,
        borderColor: active ? withAlpha(theme.colors.brandText, 0.45) : theme.colors.border,
      }}
    >
      {dot ? (
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: dot }} />
      ) : null}
      <Text variant="caption" color={accent} numberOfLines={1}>
        {label}
      </Text>
      <View
        style={{
          minWidth: 20,
          alignItems: 'center',
          paddingHorizontal: 5,
          paddingVertical: 1,
          borderRadius: theme.radius.pill,
          backgroundColor: active
            ? withAlpha(theme.colors.brandText, 0.18)
            : theme.colors.surfaceStrong,
        }}
      >
        <Text variant="caption" color={accent} maxFontSizeMultiplier={1.3}>
          {String(count)}
        </Text>
      </View>
    </Pressable>
  );
}
