import { Fragment } from 'react';
import { View } from 'react-native';

import type { BudgetSummary } from '@/api/types';
import { BudgetRow } from '@/components/budgets/BudgetRow';
import { Button, Card, Divider, Icon, SectionHeader, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';

export type BudgetSnapshotProps = {
  summary: BudgetSummary;
  monthLabel: string;
  onSeeAll: () => void;
  onCreate: () => void;
};

/** How many category budgets the dashboard shows before deferring to the tab. */
const PREVIEW_COUNT = 3;

/**
 * Budget progress, abridged for the dashboard.
 *
 * The overall budget if there is one, then the three closest to trouble — the
 * server already sorts by how full they are, so "the three that matter" is just
 * the first three. Showing every budget here would turn the dashboard into the
 * Budgets screen, which is the one next to it.
 *
 * Budgets are always the calendar month, even when the dashboard is showing a
 * week: a cap is a monthly promise, and prorating it to "₹1,615 so far this
 * week" is arithmetic nobody asked for. The month is named on the card so the
 * mismatch is stated rather than hidden.
 */
export function BudgetSnapshot({
  summary,
  monthLabel,
  onSeeAll,
  onCreate,
}: BudgetSnapshotProps) {
  const theme = useTheme();

  const hasAny = summary.overall !== null || summary.categories.length > 0;
  const preview = summary.categories.slice(0, PREVIEW_COUNT);
  const remaining = summary.categories.length - preview.length;

  if (!hasAny) {
    return (
      <View>
        <SectionHeader title="Budgets" />
        <Card radius="xl" padding="xl">
          <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.brandSurface,
              }}
            >
              <Icon name="target" size={22} color={theme.colors.brandText} strokeWidth={1.9} />
            </View>
            <Text variant="h3" align="center">
              Set a monthly budget
            </Text>
            <Text
              variant="bodySm"
              tone="secondary"
              align="center"
              style={{ maxWidth: 280, lineHeight: 21 }}
            >
              Give Food or Transport a cap and Paisa will tell you when you are close,
              before you are over.
            </Text>
            <Button
              label="Create a budget"
              onPress={onCreate}
              variant="brand"
              size="md"
              style={{ marginTop: theme.spacing.sm }}
            />
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View>
      <SectionHeader title="Budgets" actionLabel="See all" onActionPress={onSeeAll} />

      <Card padding={0} radius="xl">
        <View style={{ paddingHorizontal: theme.spacing.lg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingTop: theme.spacing.md,
            }}
          >
            <Icon name="calendar" size={13} color={theme.colors.textTertiary} strokeWidth={2} />
            <Text variant="caption" tone="tertiary" style={{ flex: 1, minWidth: 0 }}>
              {monthLabel}
            </Text>
            {summary.totals.unbudgetedSpend > 0 ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {`${formatINR(summary.totals.unbudgetedSpend)} uncapped`}
              </Text>
            ) : null}
          </View>

          {summary.overall ? (
            <>
              <BudgetRow budget={summary.overall} />
              {preview.length > 0 ? <Divider /> : null}
            </>
          ) : null}

          {preview.map((budget, index) => (
            <Fragment key={budget.id}>
              {index > 0 ? <Divider /> : null}
              <BudgetRow budget={budget} />
            </Fragment>
          ))}

          {remaining > 0 ? (
            <Text
              variant="caption"
              tone="tertiary"
              align="center"
              style={{ paddingBottom: theme.spacing.md }}
            >
              {`${remaining} more ${remaining === 1 ? 'budget' : 'budgets'}`}
            </Text>
          ) : (
            <View style={{ height: theme.spacing.xs }} />
          )}
        </View>
      </Card>
    </View>
  );
}
