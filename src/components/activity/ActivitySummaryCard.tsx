import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { Icon, PillButton, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { PeriodSummary } from '@/types/models';
import { formatINR, percentChange } from '@/utils/currency';

export type ActivitySummaryCardProps = {
  summary: PeriodSummary;
  /** Opens the period picker. Omit it and the label is plain text. */
  onPeriodPress?: () => void;
};

/**
 * The period's money at the top of Activity: what went out, what came in, and what
 * merely moved.
 *
 * Three figures rather than a chart, because all three are exact — the server
 * aggregates over the whole period, while a chart drawn from the loaded pages
 * would be a picture of how far the user has scrolled.
 *
 * The period pill lives here rather than in the toolbar above, for the same
 * reason it lives on the balance card on Home: the control belongs to the
 * figures it changes. Keeping it in the header meant a 158dp pill crushing the
 * type chips beside it into 192dp — enough for "All", "Expenses" and half of
 * "Income" — while the card underneath printed the very same date range again.
 */
export function ActivitySummaryCard({ summary, onPeriodPress }: ActivitySummaryCardProps) {
  const theme = useTheme();

  const delta = percentChange(summary.spent, summary.previousSpent);
  const spendingUp = (delta ?? 0) > 0;

  return (
    <LinearGradient
      colors={[theme.colors.heroSurface, theme.colors.heroSurfaceEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        theme.shadows.md,
        {
          borderRadius: theme.radius.xl,
          borderWidth: theme.layout.hairline,
          borderColor: theme.colors.heroBorder,
          padding: theme.spacing.xl,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Text
          variant="labelSm"
          color={theme.colors.heroTextMuted}
          style={{ flex: 1, minWidth: 0 }}
          numberOfLines={1}
        >
          Total spent
        </Text>
        {onPeriodPress ? (
          <PillButton
            label={summary.label}
            leftIcon="calendar"
            rightIcon="chevronDown"
            onHero
            accessibilityLabel={`Period, ${summary.label}`}
            accessibilityHint="Changes the period shown"
            onPress={onPeriodPress}
            style={{ flexShrink: 1 }}
          />
        ) : (
          <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
            {summary.label}
          </Text>
        )}
      </View>

      <Text
        variant="display"
        color={theme.colors.heroText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ marginTop: theme.spacing.sm }}
      >
        {formatINR(summary.spent)}
      </Text>

      {delta !== null ? (
        <View
          accessible
          accessibilityLabel={`Spending ${spendingUp ? 'up' : 'down'} ${Math.abs(delta).toFixed(
            0,
          )} percent versus the previous period`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}
        >
          <Icon
            name={spendingUp ? 'trendingUp' : 'trendingDown'}
            size={13}
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
            vs last period
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
        <Figure label="Received" value={formatINR(summary.income)} tone="positive" />
        <Figure
          label="Kept"
          value={formatINR(summary.saved, { signed: true })}
          tone={summary.saved < 0 ? 'negative' : 'positive'}
        />
        {/* Shown whenever there is one, and never folded into the two above it. */}
        {summary.transferred > 0 ? (
          <Figure label="Moved" value={formatINR(summary.transferred)} tone="muted" />
        ) : null}
      </View>
    </LinearGradient>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'muted';
}) {
  const theme = useTheme();

  const color =
    tone === 'positive'
      ? theme.colors.heroPositive
      : tone === 'negative'
        ? theme.colors.heroNegative
        : theme.colors.heroTextMuted;

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={{
        flex: 1,
        minWidth: 0,
        gap: 3,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.heroTile,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.heroTileBorder,
      }}
    >
      <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
        {label}
      </Text>
      <Text
        variant="labelSm"
        color={color}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
}
