import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { PeriodSummary } from '@/types/models';
import { formatINR, percentChange } from '@/utils/currency';

import { StatTile } from './StatTile';

export type BalanceCardProps = {
  summary: PeriodSummary;
  /** Opens the period picker. */
  onPeriodPress?: () => void;
};

/**
 * The screen's anchor: one very large number, the period it covers, and the two
 * figures that explain it.
 *
 * This is the only saturated surface in the app. Everything around it is a flat
 * card, which is what lets a single slab carry the hierarchy on its own.
 *
 * The balance is every active account added together, and it is the one number
 * here that is not period-scoped — money you have is money you have, whichever
 * month is selected above it.
 */
export function BalanceCard({ summary, onPeriodPress }: BalanceCardProps) {
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
          padding: theme.spacing.xl,
        },
      ]}
    >
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
          onPress={onPeriodPress}
          disabled={!onPeriodPress}
          accessibilityRole="button"
          accessibilityLabel={`Period, ${summary.label}`}
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
            {summary.label}
          </Text>
          {onPeriodPress ? (
            <Icon name="chevronDown" size={13} color={theme.colors.heroTextMuted} strokeWidth={2} />
          ) : null}
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
        {masked ? '••••••' : formatINR(summary.currentBalance)}
      </Text>

      {delta !== null ? (
        <View
          accessible
          accessibilityLabel={`Spending ${spendingUp ? 'up' : 'down'} ${Math.abs(delta).toFixed(
            0,
          )} percent versus the previous period`}
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
            {`Spending ${spendingUp ? 'up' : 'down'} vs last period`}
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
          masked={masked}
        />
        <StatTile
          label="Spent"
          amount={summary.spent}
          previous={summary.previousSpent}
          icon="arrowDownLeft"
          color={theme.colors.heroNegative}
          riseIsGood={false}
          masked={masked}
        />
      </View>

      {/* Transfers move money without spending it, so they sit outside the two
          tiles entirely — visible, but never mixed into either total. */}
      {summary.transferred > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: theme.spacing.md,
          }}
        >
          <Icon name="repeat" size={12} color={theme.colors.heroTextMuted} strokeWidth={2.2} />
          <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
            {`${masked ? '••••' : formatINR(summary.transferred)} moved between your accounts`}
          </Text>
        </View>
      ) : null}
    </LinearGradient>
  );
}
