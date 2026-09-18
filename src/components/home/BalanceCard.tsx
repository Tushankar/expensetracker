import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { AnimatedAmount, GlassFill, Gloss, Icon, Text, withAlpha } from '@/components/ui';
import { useTheme } from '@/theme';
import type { PeriodSummary } from '@/types/models';
import { formatINR, percentChange } from '@/utils/currency';

import { FlowStat } from './FlowStat';

export type BalanceCardProps = {
  summary: PeriodSummary;
  /** Opens the period picker. */
  onPeriodPress?: () => void;
  /** Active accounts behind the balance. Zero hides the line. */
  accountCount?: number;
  onAccountsPress?: () => void;
};

/**
 * The screen's anchor: one very large number, the period it covers, and the
 * shape of the money that moved through it.
 *
 * This is the deepest, most saturated surface in the app. Everything around it is
 * a thinner pane of the same material, which is what lets a single slab carry the
 * hierarchy on its own.
 *
 * It is glass over a gradient rather than glass alone: the gradient is what gives
 * the slab a colour of its own, and the material over it is what ties it to every
 * other surface on the screen. On iOS 26 that material is real Liquid Glass, so
 * the deepest card in the app is also the one that moves with the light.
 *
 * The balance is every active account added together, and it is the one figure
 * here that is not period-scoped — money you have is money you have, whichever
 * month is selected above it. Everything below the rail is.
 */
export function BalanceCard({
  summary,
  onPeriodPress,
  accountCount = 0,
  onAccountsPress,
}: BalanceCardProps) {
  const theme = useTheme();
  const [masked, setMasked] = useState(false);

  const delta = percentChange(summary.spent, summary.previousSpent);
  const spendingUp = (delta ?? 0) > 0;

  // The rail is a ratio, so it needs the total movement rather than either half.
  const movement = summary.income + summary.spent;
  const inShare = movement > 0 ? summary.income / movement : 0;
  const outShare = movement > 0 ? summary.spent / movement : 0;

  return (
    <LinearGradient
      colors={[theme.colors.heroSurface, theme.colors.heroSurfaceEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[
        theme.shadows.md,
        {
          borderRadius: theme.radius.xl,
          overflow: 'hidden',
          padding: theme.spacing.xl,
        },
      ]}
    >
      {/* Laid over the gradient, under everything else: the bloom is part of what
          the glass above it has to refract. */}
      <BalanceBloom color={theme.colors.brandText} />
      <GlassFill tone="hero" radius="xl" rimColor={theme.colors.heroBorder} />

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
          <Text variant="overline" color={theme.colors.heroTextMuted} numberOfLines={1}>
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

      {/* Counts to its new value rather than jumping. This is the one figure
          that moves because of something the person just did, and watching it
          settle is the app confirming the entry landed. */}
      <AnimatedAmount
        value={summary.currentBalance}
        variant="displayLg"
        color={theme.colors.heroText}
        placeholder={masked ? '••••••' : undefined}
        accessibilityLabel={
          masked ? 'Balance hidden' : `Total balance ${formatINR(summary.currentBalance)}`
        }
        style={{ marginTop: theme.spacing.sm }}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
          marginTop: theme.spacing.sm,
        }}
      >
        {delta !== null ? (
          <View
            accessible
            accessibilityLabel={`Spending ${spendingUp ? 'up' : 'down'} ${Math.abs(delta).toFixed(
              0,
            )} percent versus the previous period`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: theme.radius.pill,
              backgroundColor: withAlpha(
                spendingUp ? theme.colors.heroNegative : theme.colors.heroPositive,
                0.16,
              ),
            }}
          >
            <Icon
              name={spendingUp ? 'trendingUp' : 'trendingDown'}
              size={12}
              color={spendingUp ? theme.colors.heroNegative : theme.colors.heroPositive}
              strokeWidth={2.4}
            />
            <Text
              variant="caption"
              color={spendingUp ? theme.colors.heroNegative : theme.colors.heroPositive}
              maxFontSizeMultiplier={1.3}
            >
              {`${Math.abs(delta).toFixed(0)}% spending`}
            </Text>
          </View>
        ) : null}

        {accountCount > 0 ? (
          <Pressable
            onPress={onAccountsPress}
            disabled={!onAccountsPress}
            accessibilityRole="button"
            accessibilityLabel={`Across ${accountCount} ${
              accountCount === 1 ? 'account' : 'accounts'
            }`}
            accessibilityHint="Opens your accounts"
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
          >
            <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
              {`across ${accountCount} ${accountCount === 1 ? 'account' : 'accounts'}`}
            </Text>
            {onAccountsPress ? (
              <Icon
                name="chevronRight"
                size={13}
                color={theme.colors.heroTextMuted}
                strokeWidth={2.2}
              />
            ) : null}
          </Pressable>
        ) : null}
      </View>

      {/* The shape of the period in one line: how much came in against how much
          went out. Two independent bars would need reading; one split rail is
          read at a glance, which is the whole reason it is here. */}
      <View
        accessible
        accessibilityLabel={
          movement > 0
            ? `${Math.round(inShare * 100)} percent in, ${Math.round(outShare * 100)} percent out`
            : 'Nothing moved this period'
        }
        style={{
          flexDirection: 'row',
          gap: 3,
          height: 10,
          marginTop: theme.spacing.xl,
          borderRadius: 5,
          overflow: 'hidden',
        }}
      >
        {/* The channel the two shares sit in, cut into the slab. */}
        <GlassFill tone="thin" radius={5} sheen={false} />

        {summary.income > 0 ? (
          <View
            style={{
              flexGrow: inShare,
              flexBasis: 0,
              // A 2% sliver still has to be visible, or the rail lies by omission.
              minWidth: 5,
              borderRadius: 5,
              backgroundColor: theme.colors.heroPositive,
              overflow: 'hidden',
            }}
          >
            <Gloss radius={5} rim={false} />
          </View>
        ) : null}
        {summary.spent > 0 ? (
          <View
            style={{
              flexGrow: outShare,
              flexBasis: 0,
              minWidth: 5,
              borderRadius: 5,
              backgroundColor: theme.colors.heroNegative,
              overflow: 'hidden',
            }}
          >
            <Gloss radius={5} rim={false} />
          </View>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: theme.spacing.lg,
          marginTop: theme.spacing.md,
        }}
      >
        <FlowStat
          label="Money in"
          amount={summary.income}
          previous={summary.previousIncome}
          color={theme.colors.heroPositive}
          share={inShare}
          riseIsGood
          masked={masked}
        />

        <View
          style={{
            width: theme.layout.hairline,
            alignSelf: 'stretch',
            backgroundColor: theme.colors.heroTileBorder,
          }}
        />

        <FlowStat
          label="Money out"
          amount={summary.spent}
          previous={summary.previousSpent}
          color={theme.colors.heroNegative}
          share={outShare}
          riseIsGood={false}
          masked={masked}
        />
      </View>

      {/* Transfers move money without spending it, so they sit outside the two
          columns entirely — visible, but never mixed into either total. */}
      {summary.transferred > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            borderTopWidth: theme.layout.hairline,
            borderTopColor: theme.colors.heroTileBorder,
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

/** Atmosphere in the corner of the slab. Non-interactive and outside the layout. */
function BalanceBloom({ color }: { color: string }) {
  return (
    <Svg
      width={280}
      height={220}
      style={styles.bloom}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="balanceBloom" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.24} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.06} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={200} cy={60} rx={130} ry={100} fill="url(#balanceBloom)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bloom: { position: 'absolute', top: -40, right: -40, pointerEvents: 'none' },
});
