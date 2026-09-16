import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Fragment, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { useBudgets, type BudgetProgress } from '@/api';
import { BudgetRow, stateColor } from '@/components/budgets/BudgetRow';
import { QueryState } from '@/components/data/QueryState';
import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  IconButton,
  PageHeader,
  PillButton,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
} from '@/components/ui';
import { BudgetFormSheet } from '@/screens/sheets/BudgetFormSheet';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { monthLabel } from '@/utils/date';
import { dayFromKey, monthKeyOf } from '@/utils/period';

function shiftMonthKey(key: string, months: number): string {
  const date = dayFromKey(`${key}-01`);
  return monthKeyOf(new Date(date.getFullYear(), date.getMonth() + months, 1));
}

/**
 * Budgets: one optional overall cap, plus a cap per category.
 *
 * The month is a stepper rather than a picker. Budgets are almost always read for
 * the current month and occasionally for the one before, and two arrows beat a
 * calendar for a choice that is nearly always "this one".
 */
export function BudgetsScreen() {
  const theme = useTheme();
  const tabBarHeight = useBottomTabBarHeight();

  const [month, setMonth] = useState(() => monthKeyOf(new Date()));
  const [editing, setEditing] = useState<BudgetProgress | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formSession, setFormSession] = useState(0);

  const query = useBudgets(month);
  const summary = query.data;

  const currentMonth = monthKeyOf(new Date());
  const atCurrent = month === currentMonth;
  const label = monthLabel(dayFromKey(`${month}-01`));

  const budgeted = useMemo(
    () => new Set((summary?.categories ?? []).map((budget) => budget.categoryId ?? '')),
    [summary],
  );

  function openForm(budget: BudgetProgress | null) {
    setEditing(budget);
    setFormSession((current) => current + 1);
    setFormOpen(true);
  }

  const overall = summary?.overall ?? null;
  const categories = summary?.categories ?? [];
  const hasAny = overall !== null || categories.length > 0;

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
              variant="surface"
              onPress={() => openForm(null)}
            />
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
          <IconButton
            name="chevronLeft"
            accessibilityLabel="Previous month"
            variant="surface"
            size="sm"
            onPress={() => setMonth((current) => shiftMonthKey(current, -1))}
          />
          <PillButton
            label={label}
            leftIcon="calendar"
            accessibilityLabel={`Showing ${label}`}
            accessibilityHint={atCurrent ? undefined : 'Returns to this month'}
            onPress={atCurrent ? undefined : () => setMonth(currentMonth)}
            style={{ flex: 1, justifyContent: 'center' }}
          />
          <IconButton
            name="chevronRight"
            accessibilityLabel="Next month"
            variant="surface"
            size="sm"
            disabled={atCurrent}
            onPress={() => setMonth((current) => shiftMonthKey(current, 1))}
          />
        </View>

        <QueryState
          isLoading={query.isLoading}
          error={query.error}
          isEmpty={!hasAny}
          onRetry={() => void query.refetch()}
          loadingFallback={
            <View style={{ gap: theme.spacing.md }}>
              <Skeleton height={140} radius={theme.radius.xl} />
              <Skeleton height={220} radius={theme.radius.xl} />
            </View>
          }
          empty={{
            icon: 'target',
            title: 'No budgets yet',
            description:
              'Cap a category and Paisa will tell you when you are close, rather than after you are over.',
            action: { label: 'Create a budget', onPress: () => openForm(null) },
          }}
        >
          {summary ? (
            <>
              {overall ? (
                <Card radius="xl" padding="xl">
                  <OverallHeadline budget={overall} onEdit={() => openForm(overall)} />
                </Card>
              ) : (
                <Card variant="outlined" radius="xl" padding="lg">
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
                  >
                    <Icon name="target" size={19} color={theme.colors.textTertiary} />
                    <Text variant="bodySm" tone="secondary" style={{ flex: 1, minWidth: 0 }}>
                      No overall cap for the month
                    </Text>
                    <Button
                      label="Set one"
                      variant="ghost"
                      size="sm"
                      onPress={() => openForm(null)}
                    />
                  </View>
                </Card>
              )}

              <View style={{ marginTop: theme.spacing.xxl }}>
                <SectionHeader
                  title="By category"
                  actionLabel="Add"
                  onActionPress={() => openForm(null)}
                />

                {categories.length === 0 ? (
                  <Card variant="outlined" radius="xl" padding="xl">
                    <Text variant="bodySm" tone="secondary" align="center">
                      Give Food, Transport or Shopping a cap to see progress here.
                    </Text>
                  </Card>
                ) : (
                  <Card padding={0} radius="xl">
                    <View style={{ paddingHorizontal: theme.spacing.lg }}>
                      {categories.map((budget, index) => (
                        <Fragment key={budget.id}>
                          {index > 0 ? <Divider /> : null}
                          <BudgetRow budget={budget} onPress={openForm} />
                        </Fragment>
                      ))}
                    </View>
                  </Card>
                )}
              </View>

              {summary.totals.unbudgetedSpend > 0 ? (
                <Card variant="muted" radius="md" padding="lg" style={{ marginTop: theme.spacing.lg }}>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
                  >
                    <Icon name="info" size={17} color={theme.colors.textTertiary} />
                    <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
                      {`${formatINR(summary.totals.unbudgetedSpend)} went to categories with no cap this month.`}
                    </Text>
                  </View>
                </Card>
              ) : null}
            </>
          ) : null}
        </QueryState>
      </Screen>

      <BudgetFormSheet
        key={formSession}
        visible={formOpen}
        budget={editing}
        hasOverall={overall !== null}
        budgetedCategoryIds={budgeted}
        onClose={() => setFormOpen(false)}
      />
    </>
  );
}

function OverallHeadline({
  budget,
  onEdit,
}: {
  budget: BudgetProgress;
  onEdit: () => void;
}) {
  const theme = useTheme();
  const accent = stateColor(budget.state, theme);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Text variant="caption" tone="tertiary" style={{ flex: 1, minWidth: 0 }}>
          Monthly budget
        </Text>
        <Badge
          label={
            budget.state === 'exceeded'
              ? 'Over'
              : budget.state === 'warning'
                ? 'Close'
                : 'On track'
          }
          tone={
            budget.state === 'exceeded'
              ? 'negative'
              : budget.state === 'warning'
                ? 'warning'
                : 'positive'
          }
        />
        <IconButton
          name="settings"
          accessibilityLabel="Edit the overall budget"
          variant="tonal"
          size="sm"
          onPress={onEdit}
        />
      </View>

      <Text
        variant="amountLg"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        accessibilityLabel={`${formatINR(budget.spent)} spent of ${formatINR(budget.amount)}`}
      >
        {formatINR(budget.spent)}
        <Text variant="h2" tone="tertiary">
          {` / ${formatINR(budget.amount)}`}
        </Text>
      </Text>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          height: 10,
          borderRadius: 5,
          overflow: 'hidden',
          backgroundColor: theme.colors.surfaceStrong,
        }}
      >
        <View
          style={{
            width: `${Math.min(100, budget.percent)}%`,
            height: '100%',
            borderRadius: 5,
            backgroundColor: accent,
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="bodySm" color={accent} style={{ flex: 1, minWidth: 0 }}>
          {budget.state === 'exceeded'
            ? `${formatINR(budget.overBy)} over`
            : `${formatINR(budget.remaining)} left`}
        </Text>
        <Text variant="bodySm" tone="tertiary">
          {`${budget.percent}% used`}
        </Text>
      </View>
    </View>
  );
}
