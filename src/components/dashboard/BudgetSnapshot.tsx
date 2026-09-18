import { LinearGradient } from 'expo-linear-gradient';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

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
  type IconName,
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
 * With no caps set this is the one block on Home that has to sell something, so
 * it gets the hero treatment. With caps set it gets out of the way: three rows,
 * worst first, and a link to the tab that owns the detail.
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
              borderTopColor: 'rgba(255, 255, 255, 0.16)',
              overflow: 'hidden',
              padding: theme.spacing.xl,
            },
          ]}
        >
          <SnapshotBloom color={theme.colors.brandText} />

          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Badge label="Smart budgeting" tone="brand" />
            <Text variant="caption" color={theme.colors.heroTextMuted}>
              {monthLabel}
            </Text>
          </View>

          <Text variant="h2" color={theme.colors.heroText} style={{ marginTop: theme.spacing.lg }}>
            Decide where the month goes
          </Text>
          <Text
            variant="bodySm"
            color={theme.colors.heroTextMuted}
            style={{ marginTop: theme.spacing.xs, lineHeight: 20 }}
          >
            Set a cap and Paisa watches the pace — a nudge at 80%, a flag if you
            cross it, and a safe daily figure in between.
          </Text>

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing.xs,
              marginTop: theme.spacing.lg,
            }}
          >
            <HeroChip icon="bellAlert" label="80% alerts" />
            <HeroChip icon="gauge" label="Daily pace" />
            <HeroChip icon="shieldCheck" label="Category caps" />
          </View>

          <Button
            label="Set your first cap"
            onPress={onCreate}
            variant="brand"
            size="lg"
            fullWidth
            leftIcon="sparkle"
            style={{ marginTop: theme.spacing.xl }}
          />
        </LinearGradient>
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
            <Text
              variant="overline"
              tone="tertiary"
              numberOfLines={1}
              style={{ flex: 1, minWidth: 0 }}
            >
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

function HeroChip({ icon, label }: { icon: IconName; label: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        height: 28,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.heroTile,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.heroTileBorder,
      }}
    >
      <Icon name={icon} size={13} color={theme.colors.brandText} strokeWidth={2} />
      <Text variant="caption" color={theme.colors.heroText}>
        {label}
      </Text>
    </View>
  );
}

/** Matches the bloom on the Budgets tab, so the two entry points feel like one thing. */
function SnapshotBloom({ color }: { color: string }) {
  return (
    <Svg
      width={300}
      height={240}
      style={styles.bloom}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="budgetSnapshotBloom" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.22} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.05} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={230} cy={60} rx={150} ry={115} fill="url(#budgetSnapshotBloom)" />
      <Circle
        cx={238}
        cy={52}
        r={84}
        stroke={color}
        strokeOpacity={0.09}
        strokeWidth={1}
        fill="none"
      />
      <Circle
        cx={238}
        cy={52}
        r={120}
        stroke={color}
        strokeOpacity={0.05}
        strokeWidth={1}
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bloom: { position: 'absolute', top: -40, right: -40, pointerEvents: 'none' },
});
