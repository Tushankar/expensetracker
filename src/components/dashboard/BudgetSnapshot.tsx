import { LinearGradient } from 'expo-linear-gradient';
import { Fragment } from 'react';
import { View } from 'react-native';

import type { BudgetSummary } from '@/api/types';
import { BudgetRow } from '@/components/budgets/BudgetRow';
import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  SectionHeader,
  Text,
} from '@/components/ui';
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
 * Transformed with high-level premium fintech aesthetics:
 * - When empty: renders a glowing LinearGradient card with Apple-style top specular highlights,
 *   smart budget badges, value-prop pills, and a perfectly aligned full-width CTA.
 * - When active: renders clean, elevated budget cards with state colors and unbudgeted highlights.
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
        <SectionHeader title="Budgets" actionLabel="Create" onActionPress={onCreate} />
        <LinearGradient
          colors={[theme.colors.heroSurface, theme.colors.heroSurfaceEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[
            theme.shadows.md,
            {
              borderRadius: theme.radius.xl,
              borderWidth: theme.layout.hairline,
              borderColor: theme.colors.heroBorder,
              borderTopColor: 'rgba(255, 255, 255, 0.18)',
              overflow: 'hidden',
              padding: theme.spacing.xl,
              gap: theme.spacing.md,
            },
          ]}
        >
          {/* Header row with badge and month */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Badge label="SMART BUDGETS" tone="positive" />
            <Text variant="caption" color={theme.colors.heroTextMuted}>
              {monthLabel}
            </Text>
          </View>

          {/* Title and copy */}
          <View style={{ gap: 4 }}>
            <Text variant="h2" color={theme.colors.heroText}>
              Take Control of Your Spending
            </Text>
            <Text
              variant="bodySm"
              color={theme.colors.heroTextMuted}
              style={{ lineHeight: 20 }}
            >
              Set category caps to track real-time pacing with proactive alerts at 80% and 100% capacity — before you go over.
            </Text>
          </View>

          {/* 3 Value-Prop Frosted Feature Pills */}
          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.xs,
              flexWrap: 'wrap',
              marginVertical: 2,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: 'rgba(0, 0, 0, 0.28)',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.08)',
              }}
            >
              <Icon name="bell" size={12} color={theme.colors.brandText} />
              <Text
                variant="caption"
                color={theme.colors.heroText}
                style={{ fontSize: 11, fontWeight: '600' }}
              >
                80% Alert
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: 'rgba(0, 0, 0, 0.28)',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.08)',
              }}
            >
              <Icon name="clock" size={12} color={theme.colors.heroTextMuted} />
              <Text
                variant="caption"
                color={theme.colors.heroText}
                style={{ fontSize: 11, fontWeight: '600' }}
              >
                Daily Pace
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: 'rgba(0, 0, 0, 0.28)',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.08)',
              }}
            >
              <Icon name="target" size={12} color={theme.colors.heroTextMuted} />
              <Text
                variant="caption"
                color={theme.colors.heroText}
                style={{ fontSize: 11, fontWeight: '600' }}
              >
                Category Caps
              </Text>
            </View>
          </View>

          {/* Perfectly balanced, full-width Action Button */}
          <Button
            label="✨ Create a Budget"
            onPress={onCreate}
            variant="brand"
            size="lg"
            fullWidth
            leftIcon="plus"
            style={{ marginTop: theme.spacing.xs }}
          />
        </LinearGradient>
      </View>
    );
  }

  return (
    <View>
      <SectionHeader title="Budgets" actionLabel="See all" onActionPress={onSeeAll} />

      <Card
        padding={0}
        radius="xl"
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderTopColor: 'rgba(255, 255, 255, 0.14)',
        }}
      >
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
