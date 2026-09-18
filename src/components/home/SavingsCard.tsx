import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { ProgressRing } from '@/components/charts';
import { Card, Icon, Text, withAlpha } from '@/components/ui';
import { useTheme } from '@/theme';
import type { PeriodSummary } from '@/types/models';
import { formatINR } from '@/utils/currency';

export type SavingsCardProps = {
  summary: PeriodSummary;
  onPress?: () => void;
};

/** The rate a savings figure is usually measured against. */
const HEALTHY_RATE = 20;

/**
 * Savings framed as a rate, not just a number. "₹71,773" means little on its own;
 * "46% of what you earned" is the figure someone can act on, so the ring and the
 * line beneath it both quote the same percentage.
 *
 * The note at the bottom compares that rate to something — 20% is the benchmark
 * most guidance lands on — because a percentage with nothing to measure it against
 * is just another number to interpret.
 */
export function SavingsCard({ summary, onPress }: SavingsCardProps) {
  const theme = useTheme();

  const rate = summary.income > 0 ? summary.saved / summary.income : 0;
  const overspent = summary.saved < 0;
  const percent = Math.round(Math.abs(rate) * 100);
  const accent = overspent ? theme.colors.negative : theme.colors.positive;

  const verdict = overspent
    ? {
        icon: 'alertTriangle' as const,
        title: `Spending ran ${percent}% past what came in`,
        body: 'Trimming one category is usually enough to close a gap this size.',
      }
    : percent >= HEALTHY_RATE * 2
      ? {
          icon: 'shieldCheck' as const,
          title: `Keeping ${percent}% of what you earned`,
          body: `Well clear of the ${HEALTHY_RATE}% rate most guidance aims for.`,
        }
      : percent >= HEALTHY_RATE
        ? {
            icon: 'check' as const,
            title: `Keeping ${percent}% of what you earned`,
            body: `Above the ${HEALTHY_RATE}% rate worth holding each month.`,
          }
        : {
            icon: 'bulb' as const,
            title: `Keeping ${percent}% of what you earned`,
            body: `A little under the ${HEALTHY_RATE}% rate worth aiming for.`,
          };

  return (
    <Card radius="xl" padding="xl" style={styles.clip}>
      <SavingsBloom color={accent} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text variant="overline" tone="tertiary" numberOfLines={1}>
            {overspent ? 'Overspent this period' : 'Saved this period'}
          </Text>

          <Text variant="h1" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {formatINR(Math.abs(summary.saved))}
          </Text>

          {summary.income > 0 ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {`of ${formatINR(summary.income)} earned`}
            </Text>
          ) : null}
        </View>

        <ProgressRing
          value={overspent ? 1 : rate}
          size={104}
          thickness={10}
          color={accent}
          // One hue, flat: savings is a money-direction figure, and a ring that
          // graded off into the brand colour would stop reading as "kept".
          trackColor={theme.colors.surfaceStrong}
          gradientId="savingsRing"
          accessibilityLabel={`Savings rate ${percent} percent`}
        >
          <Text variant="h2" numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {`${percent}%`}
          </Text>
          <Text variant="overline" tone="tertiary" maxFontSizeMultiplier={1.2}>
            {overspent ? 'over' : 'saved'}
          </Text>
        </ProgressRing>
      </View>

      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={`${verdict.title}. ${verdict.body}`}
        accessibilityHint="Opens your transactions for this period"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginTop: theme.spacing.lg,
          padding: theme.spacing.md,
          borderRadius: theme.radius.md,
          backgroundColor: pressed ? theme.colors.surfaceStrong : theme.colors.surfaceMuted,
          borderWidth: theme.layout.hairline,
          borderColor: withAlpha(accent, 0.2),
        })}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 32,
            height: 32,
            borderRadius: theme.radius.xs,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(accent, 0.16),
          }}
        >
          <Icon name={verdict.icon} size={17} color={accent} strokeWidth={2.1} />
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="labelSm" numberOfLines={1}>
            {verdict.title}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={2}>
            {verdict.body}
          </Text>
        </View>

        {onPress ? (
          <Icon name="chevronRight" size={16} color={theme.colors.textTertiary} />
        ) : null}
      </Pressable>
    </Card>
  );
}

/** Atmosphere behind the ring, so the card is not a flat rectangle. */
function SavingsBloom({ color }: { color: string }) {
  return (
    <Svg
      width={240}
      height={200}
      style={styles.bloom}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="savingsBloom" cx="50%" cy="50%" r="50%">
          {/* Capped: this bloom sits over glass that is itself over the ambient
          field, and the two together were taking captions on this card under
          AA. What shows inside the card was always the falloff anyway. */}
          <Stop offset="0" stopColor={color} stopOpacity={0.1} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.03} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={170} cy={70} rx={110} ry={90} fill="url(#savingsBloom)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  bloom: { position: 'absolute', top: -30, right: -30, pointerEvents: 'none' },
});
