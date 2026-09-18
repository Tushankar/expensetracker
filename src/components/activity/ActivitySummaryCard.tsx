import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { Icon, PillButton, Text, withAlpha } from '@/components/ui';
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
 * Every figure is exact — the server aggregates over the whole period, while
 * anything drawn from the loaded pages would be a picture of how far the user has
 * scrolled. The one graphic is a ratio, not a trend, for the same reason.
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

  // The rail is a ratio, so it needs the total movement rather than either half.
  const movement = summary.income + summary.spent;
  const outShare = movement > 0 ? summary.spent / movement : 0;
  const inShare = movement > 0 ? summary.income / movement : 0;

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
          // A lighter top edge reads as a light source above the slab.
          borderTopColor: 'rgba(255, 255, 255, 0.16)',
          overflow: 'hidden',
          padding: theme.spacing.xl,
        },
      ]}
    >
      <SummaryBloom color={theme.colors.heroNegative} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Text
          variant="overline"
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
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.sm }}
        >
          <View
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
              {`${Math.abs(delta).toFixed(0)}%`}
            </Text>
          </View>
          <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
            vs last period
          </Text>
        </View>
      ) : null}

      {/* Out against in, as one rail. The same graphic carries the same meaning on
          the balance card, so the two screens read as one app. */}
      <View
        accessible
        accessibilityLabel={
          movement > 0
            ? `${Math.round(outShare * 100)} percent out, ${Math.round(inShare * 100)} percent in`
            : 'Nothing moved this period'
        }
        style={{
          flexDirection: 'row',
          gap: 3,
          height: 10,
          marginTop: theme.spacing.xl,
          borderRadius: 5,
          backgroundColor: theme.colors.heroTile,
          borderWidth: theme.layout.hairline,
          borderColor: theme.colors.heroTileBorder,
          overflow: 'hidden',
        }}
      >
        {summary.spent > 0 ? (
          <View
            style={{
              flexGrow: outShare,
              flexBasis: 0,
              // A 2% sliver still has to be visible, or the rail lies by omission.
              minWidth: 5,
              borderRadius: 5,
              backgroundColor: theme.colors.heroNegative,
            }}
          />
        ) : null}
        {summary.income > 0 ? (
          <View
            style={{
              flexGrow: inShare,
              flexBasis: 0,
              minWidth: 5,
              borderRadius: 5,
              backgroundColor: theme.colors.heroPositive,
            }}
          />
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
        <Figure
          label="Received"
          value={formatINR(summary.income)}
          share={inShare}
          color={theme.colors.heroPositive}
        />
        <Rule />
        <Figure
          label="Kept"
          value={formatINR(summary.saved, { signed: true })}
          color={summary.saved < 0 ? theme.colors.heroNegative : theme.colors.heroPositive}
        />
      </View>

      {/* Transfers move money without spending it, so they sit outside the figures
          entirely — visible, but never folded into either one. */}
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
            {`${formatINR(summary.transferred)} moved between your accounts`}
          </Text>
        </View>
      ) : null}
    </LinearGradient>
  );
}

/**
 * One supporting figure under the rail.
 *
 * Borderless: the rail above already groups these, and a filled tile around each
 * one was competing with the total for weight on a card that only has one
 * headline.
 */
function Figure({
  label,
  value,
  share,
  color,
}: {
  label: string;
  value: string;
  /** Omitted for a figure that is not a slice of the rail, such as what was kept. */
  share?: number;
  color: string;
}) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={{ flex: 1, minWidth: 0, gap: 5 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
          {label}
        </Text>
        {share !== undefined && share > 0 ? (
          <Text variant="caption" color={theme.colors.heroTextMuted} style={{ opacity: 0.7 }}>
            {`${Math.round(share * 100)}%`}
          </Text>
        ) : null}
      </View>
      <Text
        variant="amount"
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

function Rule() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: theme.layout.hairline,
        alignSelf: 'stretch',
        backgroundColor: theme.colors.heroTileBorder,
      }}
    />
  );
}

/** Atmosphere on the slab. Non-interactive and outside the layout. */
function SummaryBloom({ color }: { color: string }) {
  return (
    <Svg
      width={280}
      height={200}
      style={styles.bloom}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="activitySummaryBloom" cx="50%" cy="50%" r="50%">
          {/* Capped: this bloom sits over glass that is itself over the ambient
          field, and the two together were taking captions on this card under
          AA. What shows inside the card was always the falloff anyway. */}
          <Stop offset="0" stopColor={color} stopOpacity={0.1} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.03} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={200} cy={55} rx={130} ry={95} fill="url(#activitySummaryBloom)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bloom: { position: 'absolute', top: -36, right: -36, pointerEvents: 'none' },
});
