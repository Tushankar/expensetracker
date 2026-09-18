import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { DonutChart } from '@/components/charts';
import { Card, EmptyState, Icon, SectionHeader, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { CategorySlice, Paise } from '@/types/models';
import { formatCompactINR, formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

/** Widest a figure can be inside the ring's hole without touching the stroke. */
const HOLE_WIDTH = 92;

/**
 * The total, sized to the hole it sits in.
 *
 * Exact up to a lakh, which is as wide as the hole takes at this type size, and
 * short-form above it. A clipped total is worse than a rounded one, and the exact
 * figure for every category is on the rows below either way.
 */
function holeAmount(spent: Paise): string {
  return Math.abs(spent) < 10000000 ? formatINR(spent) : formatCompactINR(spent);
}

export type SpendingOverviewProps = {
  spent: Paise;
  /** Largest first. Anything past the fifth is already folded into "Others". */
  breakdown: readonly CategorySlice[];
  /** The period the split covers, e.g. "1–30 September". */
  periodLabel?: string;
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
 * The ring is centred and the rows run the full width beneath it rather than
 * being squeezed into the space beside it. A legend crammed against a chart has
 * to choose between truncating the category, the amount or the share; given the
 * whole width, it can carry all three and a proportion bar as well.
 *
 * Amounts sit beside the percentages because a share without a figure is not
 * actionable — "Food, 32%" does not tell you whether to worry.
 */
export function SpendingOverview({
  spent,
  breakdown,
  periodLabel,
  onSeeAll,
  onCategoryPress,
}: SpendingOverviewProps) {
  const theme = useTheme();

  const segments = breakdown.map((slice) => ({
    key: slice.key,
    share: slice.share,
    color: slice.color,
    label: slice.label,
    percent: Math.round(slice.share * 100),
    amount: slice.amount,
  }));

  const countLabel = `${segments.length} ${segments.length === 1 ? 'category' : 'categories'}`;

  return (
    <View>
      <SectionHeader
        title="Where it went"
        actionLabel={onSeeAll ? 'See all' : undefined}
        onActionPress={onSeeAll}
      />

      {spent === 0 || segments.length === 0 ? (
        <Card radius="xl" padding="lg">
          <EmptyState
            icon="pieChart"
            title="Nothing spent yet"
            description="Once you record an expense, the split lands here."
          />
        </Card>
      ) : (
        <Card radius="xl" padding="xl" style={styles.clip}>
          <SplitBloom color={segments[0]?.color ?? theme.colors.brandText} />

          <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
            <DonutChart
              segments={segments}
              size={136}
              thickness={16}
              accessibilityLabel={`Spending split: ${segments
                .map((segment) => `${segment.label} ${segment.percent}%`)
                .join(', ')}`}
            >
              <Text variant="overline" tone="tertiary" maxFontSizeMultiplier={1.15}>
                spent
              </Text>
              <Text
                variant="amount"
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
                style={{ maxWidth: HOLE_WIDTH }}
              >
                {holeAmount(spent)}
              </Text>
            </DonutChart>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {countLabel}
              </Text>
              {periodLabel ? (
                <>
                  <View
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: 1.5,
                      backgroundColor: theme.colors.textTertiary,
                    }}
                  />
                  <Text variant="caption" tone="tertiary" numberOfLines={1}>
                    {periodLabel}
                  </Text>
                </>
              ) : null}
            </View>
          </View>

          <View
            style={{
              height: theme.layout.hairline,
              backgroundColor: theme.colors.divider,
              marginVertical: theme.spacing.lg,
            }}
          />

          <View style={{ gap: theme.spacing.md }}>
            {segments.map((segment) => (
              <CategoryShare
                key={segment.key}
                label={segment.label}
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
        </Card>
      )}
    </View>
  );
}

/** Dot, name, share and amount on one line; the proportion bar under it. */
function CategoryShare({
  label,
  amount,
  percent,
  share,
  color,
  onPress,
}: {
  label: string;
  amount: Paise;
  percent: number;
  share: number;
  color: string;
  onPress?: () => void;
}) {
  const theme = useTheme();

  const body = (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text variant="labelSm" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
          {label}
        </Text>
        {/* Both trailing figures have a floor width and sit right-aligned, so the
            shares line up under each other and the money forms a single column
            instead of drifting with the length of the row above it. */}
        <Text variant="caption" tone="tertiary" numberOfLines={1} align="right" style={{ minWidth: 32 }}>
          {`${percent}%`}
        </Text>
        <Text variant="amountSm" numberOfLines={1} align="right" style={{ minWidth: 72 }}>
          {formatINR(amount)}
        </Text>
        {onPress ? (
          <Icon name="chevronRight" size={14} color={theme.colors.textTertiary} strokeWidth={2} />
        ) : null}
      </View>

      <View
        style={{
          height: 5,
          marginLeft: 14,
          borderRadius: 2.5,
          backgroundColor: theme.colors.surfaceStrong,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            // A 1% slice still has to be visible as a bar rather than vanish into
            // the track — but it is drawn from the true share, never rounded up.
            width: `${Math.min(100, Math.max(1.5, share * 100))}%`,
            height: '100%',
            borderRadius: 2.5,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );

  const accessibilityLabel = `${label}, ${formatINR(amount)}, ${percent} percent of this period`;

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
      accessibilityHint="Opens this category's transactions"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}

/**
 * Tints the card with the colour of the biggest slice, behind the ring.
 *
 * Wrapped in a stretched row rather than positioned directly: the glow has to sit
 * under the centre of a card whose width is not known here, and centring an
 * absolutely placed fixed-width SVG any other way means guessing at an offset.
 */
function SplitBloom({ color }: { color: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.bloomAnchor}
    >
      <Svg width={260} height={200}>
        <Defs>
          <RadialGradient id="splitBloom" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.13} />
            <Stop offset="0.6" stopColor={color} stopOpacity={0.03} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={130} cy={70} rx={120} ry={95} fill="url(#splitBloom)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  bloomAnchor: {
    position: 'absolute',
    top: -40,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
});
