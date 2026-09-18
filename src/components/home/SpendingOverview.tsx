import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { DonutChart } from '@/components/charts';
import { toIconName } from '@/components/icons/registry';
import {
  Card,
  EmptyState,
  Icon,
  MerchantAvatar,
  SectionHeader,
  Text,
  withAlpha,
} from '@/components/ui';
import { merchantDomain } from '@/data/merchants';
import { layout, useTheme } from '@/theme';
import type { CategorySlice, Paise } from '@/types/models';
import { formatCompactINR, formatINR, percentChange } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

/** Widest a figure can be inside the ring's hole without touching the stroke. */
const HOLE_WIDTH = 116;

const RING_SIZE = 184;
const RING_THICKNESS = 20;

/**
 * How far the ring's halo spreads past it.
 *
 * Kept modest on purpose: the card clips its own overflow so the corner wash
 * cannot escape the rounded edge, which means a wide halo would be cut off on
 * the side the ring is flush against once the layout goes side by side.
 */
const GLOW_SPREAD = 26;

/**
 * Inner width at which the ring and the category list can sit side by side.
 *
 * Below it they stack: a 184dp ring beside a column narrow enough to truncate
 * "Entertainment" is worse than the same two things in sequence.
 */
const SIDE_BY_SIDE_MIN = 430;

/**
 * The total, sized to the hole it sits in.
 *
 * Exact up to a lakh, which is as wide as the hole takes at this type size, and
 * short-form above it. A clipped total is worse than a rounded one, and the exact
 * figure for every category is on the cards beside it either way.
 */
function holeAmount(spent: Paise): string {
  return Math.abs(spent) < 10000000 ? formatINR(spent) : formatCompactINR(spent);
}

export type SpendingOverviewProps = {
  spent: Paise;
  /** Largest first. Anything past the fifth is already folded into "Others". */
  breakdown: readonly CategorySlice[];
  /** The previous period's spend, for the change inside the ring. */
  previousSpent?: Paise;
  /** The period the split covers, e.g. "1–30 September". */
  periodLabel?: string;
  /** Opens the period picker from the header control. */
  onPeriodPress?: () => void;
  onSeeAll?: () => void;
  onCategoryPress?: (categoryKey: string, categoryLabel: string) => void;
};

/**
 * Where the period's money went.
 *
 * One chart and one list, both driven by the same server-side aggregation over
 * the whole period — not by whichever page of transactions happens to be loaded.
 * That is why changing the period re-queries instead of re-filtering: a "6
 * months" view that quietly summarised the most recent 25 rows would be worse
 * than no view at all.
 *
 * The block owns its own title and period control rather than sitting under a
 * section header, because both belong to the figures inside it. Each category is
 * a card rather than a list row: a name, its group, its share, its amount and a
 * proportion bar is more than a row's worth of content, and cramming it into one
 * line is what made the earlier version unreadable.
 *
 * Amounts sit beside the percentages because a share without a figure is not
 * actionable — "Food, 32%" does not tell you whether to worry.
 */
export function SpendingOverview({
  spent,
  breakdown,
  previousSpent,
  periodLabel,
  onPeriodPress,
  onSeeAll,
  onCategoryPress,
}: SpendingOverviewProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  // The width the card's contents actually get, not the window's: gutters and the
  // card's own padding are both taken out before the layout decision is made.
  const innerWidth =
    Math.min(width, layout.maxContentWidth) - layout.screenGutter * 2 - theme.spacing.xl * 2;
  const sideBySide = innerWidth >= SIDE_BY_SIDE_MIN;

  const segments = breakdown.map((slice) => ({
    key: slice.key,
    share: slice.share,
    color: slice.color,
    label: slice.label,
    group: slice.group,
    icon: slice.icon,
    percent: Math.round(slice.share * 100),
    amount: slice.amount,
  }));

  const delta =
    previousSpent === undefined || previousSpent === 0
      ? null
      : percentChange(spent, previousSpent);
  const spendingUp = (delta ?? 0) > 0;

  const countLabel = `${segments.length} ${segments.length === 1 ? 'category' : 'categories'}`;

  if (spent === 0 || segments.length === 0) {
    return (
      <View>
        <SectionHeader
          title="Where it went"
          actionLabel={onSeeAll ? 'See all' : undefined}
          onActionPress={onSeeAll}
        />
        <Card radius="xl" padding="lg">
          <EmptyState
            icon="pieChart"
            title="Nothing spent yet"
            description="Once you record an expense, the split lands here."
          />
        </Card>
      </View>
    );
  }

  return (
    <Card
      radius="xl"
      padding="xl"
      style={styles.clip}
      backdrop={<CornerBloom color={segments[0]?.color ?? theme.colors.brandText} />}
    >

      <Header
        sideBySide={sideBySide}
        periodLabel={periodLabel}
        onPeriodPress={onPeriodPress}
      />

      <View
        style={{
          flexDirection: sideBySide ? 'row' : 'column',
          alignItems: 'center',
          gap: theme.spacing.xl,
        }}
      >
        <View style={{ width: RING_SIZE, height: RING_SIZE }}>
          <RingGlow color={segments[0]?.color ?? theme.colors.brandText} />
          <DonutChart
            segments={segments}
            size={RING_SIZE}
            thickness={RING_THICKNESS}
            gradient
            rounded
            gradientId="spendingSplit"
            accessibilityLabel={`Spending split: ${segments
              .map((segment) => `${segment.label} ${segment.percent}%`)
              .join(', ')}`}
          >
            <Text variant="overline" tone="tertiary" maxFontSizeMultiplier={1.15}>
              Total spent
            </Text>
            <Text
              variant="h1"
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.1}
              style={{ maxWidth: HOLE_WIDTH, marginTop: 1 }}
            >
              {holeAmount(spent)}
            </Text>

            {delta !== null ? (
              <View style={{ alignItems: 'center', gap: 2, marginTop: 6 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderRadius: theme.radius.pill,
                    backgroundColor: withAlpha(
                      spendingUp ? theme.colors.negative : theme.colors.positive,
                      0.16,
                    ),
                  }}
                >
                  <Icon
                    name={spendingUp ? 'trendingUp' : 'trendingDown'}
                    size={11}
                    color={spendingUp ? theme.colors.negative : theme.colors.positive}
                    strokeWidth={2.4}
                  />
                  <Text
                    variant="caption"
                    color={spendingUp ? theme.colors.negative : theme.colors.positive}
                    maxFontSizeMultiplier={1.2}
                  >
                    {`${spendingUp ? '+' : '−'}${Math.abs(delta).toFixed(0)}%`}
                  </Text>
                </View>
                <Text variant="caption" tone="tertiary" maxFontSizeMultiplier={1.15}>
                  vs last period
                </Text>
              </View>
            ) : null}
          </DonutChart>
        </View>

        <View
          style={{
            flex: sideBySide ? 1 : undefined,
            // Stacked, the cards take the full width; beside the ring they centre
            // on it rather than stretching to the row's height.
            alignSelf: sideBySide ? 'auto' : 'stretch',
            gap: theme.spacing.sm,
          }}
        >
          {segments.map((segment, index) => (
            <CategoryCard
              key={`cat-card-${segment.key || segment.label || index}-${index}`}
              label={segment.label}
              group={segment.group}
              icon={segment.icon}
              amount={segment.amount}
              percent={segment.percent}
              share={segment.share}
              color={segment.color}
              onPress={
                onCategoryPress ? () => onCategoryPress(segment.key, segment.label) : undefined
              }
            />
          ))}
        </View>
      </View>

      {/* The strip's text column is what is left after a 40dp tile and the See
          all control, so the sentence is only spelled out where it fits. On a
          phone it clipped at two lines. */}
      <FooterStrip
        countLabel={countLabel}
        detail={
          sideBySide
            ? `Your spending across ${countLabel}${periodLabel ? ` in ${periodLabel}` : ''}.`
            : periodLabel
              ? `Across ${periodLabel}`
              : 'This period'
        }
        onSeeAll={onSeeAll}
      />
    </Card>
  );
}

/**
 * Title, subtitle and period control.
 *
 * Given the room, all three share one row with the control centred against the
 * two-line block beside it. On a phone that row is about 157dp short of holding
 * a 190dp subtitle, so the subtitle drops to its own full-width line and the
 * heading steps down a size — which is what stops both of them truncating.
 */
function Header({
  sideBySide,
  periodLabel,
  onPeriodPress,
}: {
  sideBySide: boolean;
  periodLabel?: string;
  onPeriodPress?: () => void;
}) {
  const theme = useTheme();

  /* One word in the accent. This block is the only place on Home with a title of
     its own, so it is allowed to be the loudest heading. */
  const title = (
    <Text
      variant={sideBySide ? 'h1' : 'h2'}
      numberOfLines={1}
      style={sideBySide ? undefined : { flex: 1, minWidth: 0 }}
    >
      Where it{' '}
      <Text variant={sideBySide ? 'h1' : 'h2'} color={theme.colors.brandText}>
        went
      </Text>
    </Text>
  );

  const control = periodLabel ? (
    <PeriodControl label={periodLabel} onPress={onPeriodPress} compact={!sideBySide} />
  ) : null;

  if (sideBySide) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.xl,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          {title}
          <Text variant="bodySm" tone="secondary" numberOfLines={1}>
            A breakdown of your spending
          </Text>
        </View>
        {control}
      </View>
    );
  }

  return (
    <View style={{ gap: 4, marginBottom: theme.spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        {title}
        {control}
      </View>
      <Text variant="bodySm" tone="secondary" numberOfLines={2}>
        A breakdown of your spending
      </Text>
    </View>
  );
}

/** The period button in the header. Matches the pill on the balance card. */
function PeriodControl({
  label,
  onPress,
  compact = false,
}: {
  label: string;
  onPress?: () => void;
  /** Tightens the control so the heading beside it keeps its line on a phone. */
  compact?: boolean;
}) {
  const theme = useTheme();

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: compact ? 5 : 6,
        height: compact ? 34 : 40,
        paddingHorizontal: compact ? theme.spacing.sm + 2 : theme.spacing.md,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.border,
      }}
    >
      {/* The glyph gets its own tinted tile, which is what stops the control
          reading as a plain bordered box with text in it. */}
      <View
        style={{
          width: compact ? 22 : 26,
          height: compact ? 22 : 26,
          borderRadius: theme.radius.xs,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.brandSurface,
        }}
      >
        <Icon
          name="calendar"
          size={compact ? 12 : 14}
          color={theme.colors.brandText}
          strokeWidth={2}
        />
      </View>
      <Text variant="caption" numberOfLines={1}>
        {label}
      </Text>
      {onPress ? (
        <Icon
          name="chevronDown"
          size={compact ? 13 : 14}
          color={theme.colors.textTertiary}
          strokeWidth={2}
        />
      ) : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Period, ${label}`}
      accessibilityHint="Changes the period this breakdown covers"
      hitSlop={6}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, flexShrink: 1 })}
    >
      {body}
    </Pressable>
  );
}

/**
 * One category, as its own panel.
 *
 * The share is printed in the category's own colour so the figure, the bar and
 * the arc in the ring are all recognisably the same thing; the amount stays in
 * primary text, because it is the number being read rather than matched.
 */
function CategoryCard({
  label,
  group,
  icon,
  amount,
  percent,
  share,
  color,
  onPress,
}: {
  label: string;
  group?: string;
  icon?: string;
  amount: Paise;
  percent: number;
  share: number;
  color: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const domain = merchantDomain(label);

  const body = (
    <View
      style={{
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        {/* A real brand mark when the label names one — the same lookup the
            transaction rows use, so Netflix is the Netflix logo here too. A
            category that is not a business keeps its own glyph, which says more
            than a monogram letter would. */}
        {domain ? (
          <MerchantAvatar name={label} domain={domain} size={40} style={{ borderRadius: 20 }} />
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(color, 0.16),
              borderWidth: theme.layout.hairline,
              borderColor: withAlpha(color, 0.32),
            }}
          >
            <Icon name={toIconName(icon)} size={19} color={color} strokeWidth={2} />
          </View>
        )}

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="label" numberOfLines={1}>
            {label}
          </Text>
          {group ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {group}
            </Text>
          ) : null}
        </View>

        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text variant="labelSm" color={color} numberOfLines={1}>
            {`${percent}%`}
          </Text>
          <Text variant="amountSm" numberOfLines={1}>
            {formatINR(amount)}
          </Text>
        </View>

        {onPress ? (
          <Icon name="chevronRight" size={16} color={theme.colors.textTertiary} strokeWidth={2} />
        ) : null}
      </View>

      {/* The track is a wash of the category's own colour rather than a neutral
          grey. A 3% fill on a grey track reads as a stray mark; on a tinted one it
          reads as a bar that is nearly empty, which is the thing being said. */}
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: withAlpha(color, 0.16),
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            // Floored so a tiny slice is still a bar, but never rounded up.
            width: `${Math.min(100, Math.max(2, share * 100))}%`,
            height: '100%',
            borderRadius: 3,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );

  const accessibilityLabel = [
    label,
    group,
    formatINR(amount),
    `${percent} percent of this period`,
  ]
    .filter(Boolean)
    .join(', ');

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // Says what it does, not what it looks like it should do: the list it opens
      // is not filtered to this category yet.
      accessibilityHint="Opens your transactions"
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      {body}
    </Pressable>
  );
}

/** Closing strip: what the split covers, and the way through to the full list. */
function FooterStrip({
  countLabel,
  detail,
  onSeeAll,
}: {
  countLabel: string;
  detail: string;
  onSeeAll?: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        marginTop: theme.spacing.xl,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 40,
          height: 40,
          borderRadius: theme.radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.brandSurface,
          borderWidth: theme.layout.hairline,
          borderColor: withAlpha(theme.colors.brandText, 0.24),
        }}
      >
        <Icon name="barChart" size={19} color={theme.colors.brandText} strokeWidth={2} />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="label" numberOfLines={1}>
          {countLabel}
        </Text>
        <Text variant="caption" tone="tertiary" numberOfLines={2}>
          {detail}
        </Text>
      </View>

      {onSeeAll ? (
        <Pressable
          onPress={() => {
            tapFeedback();
            onSeeAll();
          }}
          accessibilityRole="button"
          accessibilityLabel="See all transactions"
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            height: 34,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surface,
            borderWidth: theme.layout.hairline,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text variant="caption" numberOfLines={1}>
            See all
          </Text>
          <Icon name="chevronRight" size={13} color={theme.colors.textTertiary} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The halo behind the ring.
 *
 * Sized to the ring and centred on it, which a card-level glow cannot be — and a
 * real shadow cannot do this at all: `shadowColor` is ignored on Android, and
 * `elevation` draws a grey box rather than a coloured bloom.
 */
function RingGlow({ color }: { color: string }) {
  const box = RING_SIZE + GLOW_SPREAD * 2;
  // Put the gradient's brightest ring on the stroke itself, so the halo reads as
  // light coming off the arc rather than a disc sitting behind it.
  const peak = (RING_SIZE - RING_THICKNESS) / 2 / (box / 2);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.ringGlow}
    >
      <Svg width={box} height={box}>
        <Defs>
          <RadialGradient id="ringGlow" cx="50%" cy="50%" r="50%">
            <Stop offset={peak * 0.6} stopColor={color} stopOpacity={0} />
            <Stop offset={peak} stopColor={color} stopOpacity={0.13} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={box / 2} cy={box / 2} rx={box / 2} ry={box / 2} fill="url(#ringGlow)" />
      </Svg>
    </View>
  );
}

/** Faint wash in the card's top corner, in the colour of the biggest slice. */
function CornerBloom({ color }: { color: string }) {
  return (
    <Svg
      width={260}
      height={200}
      style={styles.cornerBloom}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="splitCornerBloom" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.14} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.035} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={190} cy={50} rx={120} ry={95} fill="url(#splitCornerBloom)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  cornerBloom: { position: 'absolute', top: -40, right: -40, pointerEvents: 'none' },
  ringGlow: {
    position: 'absolute',
    top: -GLOW_SPREAD,
    left: -GLOW_SPREAD,
    pointerEvents: 'none',
  },
});
