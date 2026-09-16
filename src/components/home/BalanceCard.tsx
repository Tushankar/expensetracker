import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Sparkline } from '@/components/charts';
import { Icon, Text } from '@/components/ui';
import { incomeTrend, spendTrend } from '@/data/mock';
import { useTheme } from '@/theme';
import type { MonthSummary } from '@/types/models';
import { formatINR, percentChange } from '@/utils/currency';
import { monthRangeLabel } from '@/utils/date';

import { StatTile } from './StatTile';

export type BalanceCardProps = {
  summary: MonthSummary;
  trend: readonly number[];
  /** Available width, so the trend line can be sized without a layout pass. */
  width: number;
};

/**
 * The screen's anchor: one very large number, the month it covers, and the two
 * figures that explain it.
 *
 * This is the only saturated surface in the app. Everything around it is a flat
 * card, which is what lets a single slab carry the hierarchy on its own.
 */
export function BalanceCard({ summary, trend, width }: BalanceCardProps) {
  const theme = useTheme();
  const [masked, setMasked] = useState(false);

  const delta = percentChange(summary.spent, summary.previousSpent);
  const spendingUp = (delta ?? 0) > 0;

  return (
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
          overflow: 'hidden',
        },
      ]}
    >
      {/* Trend line, bled to the card edges behind the figures. Padding lives on the
          content wrapper below so this measures against an unpadded parent. */}
      <View style={styles.trend} pointerEvents="none">
        <Sparkline
          data={trend}
          width={width}
          height={96}
          color={theme.colors.brand}
          gradientId="balanceTrend"
        />
      </View>

      <View style={{ padding: theme.spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Pressable
          onPress={() => setMasked((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={
            masked ? 'Show balance' : `Total balance ${formatINR(summary.currentBalance)}`
          }
          accessibilityHint="Double tap to hide or show your balance"
          hitSlop={10}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Text variant="labelSm" color={theme.colors.heroTextMuted}>
            Total Balance
          </Text>
          <Icon
            name={masked ? 'eyeOff' : 'eye'}
            size={15}
            color={theme.colors.heroTextMuted}
            strokeWidth={1.9}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Period, ${monthRangeLabel(summary.month)}`}
          accessibilityHint="Changes the period this summary covers"
          hitSlop={8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.heroTile,
            borderWidth: theme.layout.hairline,
            borderColor: theme.colors.heroTileBorder,
          }}
        >
          <Icon name="calendar" size={13} color={theme.colors.heroTextMuted} strokeWidth={2} />
          <Text variant="caption" color={theme.colors.heroText} numberOfLines={1}>
            {monthRangeLabel(summary.month)}
          </Text>
          <Icon name="chevronDown" size={13} color={theme.colors.heroTextMuted} strokeWidth={2} />
        </Pressable>
      </View>

      <Text
        variant="amountLg"
        color={theme.colors.heroText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ marginTop: theme.spacing.md }}
      >
        {masked ? '\u2022\u2022\u2022\u2022\u2022\u2022' : formatINR(summary.currentBalance)}
      </Text>

      {delta !== null ? (
        <View
          accessible
          accessibilityLabel={`Spending ${spendingUp ? 'up' : 'down'} ${Math.abs(delta).toFixed(
            0,
          )} percent versus last month`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: theme.spacing.sm }}
        >
          <Icon
            name={spendingUp ? 'trendingUp' : 'trendingDown'}
            size={14}
            color={spendingUp ? theme.colors.heroNegative : theme.colors.heroPositive}
            strokeWidth={2.4}
          />
          <Text
            variant="caption"
            color={spendingUp ? theme.colors.heroNegative : theme.colors.heroPositive}
          >
            {`${Math.abs(delta).toFixed(0)}%`}
          </Text>
          <Text variant="caption" color={theme.colors.heroTextMuted}>
            {`Spending ${spendingUp ? 'up' : 'down'} vs last month`}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
        <StatTile
          label="Income"
          amount={summary.income}
          previous={summary.previousIncome}
          icon="arrowUpRight"
          color={theme.colors.heroPositive}
          riseIsGood
          trend={incomeTrend}
          masked={masked}
        />
        <StatTile
          label="Spent"
          amount={summary.spent}
          previous={summary.previousSpent}
          icon="arrowDownLeft"
          color={theme.colors.heroNegative}
          riseIsGood={false}
          trend={spendTrend}
          masked={masked}
        />
      </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  trend: { position: 'absolute', left: 0, right: 0, top: 78 },
});
