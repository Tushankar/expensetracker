import { Pressable, View } from 'react-native';

import { ProgressRing } from '@/components/charts';
import { Card, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { PeriodSummary } from '@/types/models';
import { formatINR } from '@/utils/currency';

export type SavingsCardProps = {
  summary: PeriodSummary;
  onPress?: () => void;
};

/**
 * Savings framed as a rate, not just a number. "₹71,773" means little on its own;
 * "46% of what you earned" is the figure someone can act on, so the ring and the
 * tip line both quote the same percentage.
 */
export function SavingsCard({ summary, onPress }: SavingsCardProps) {
  const theme = useTheme();

  // Savings rate, not a savings figure: ₹71,773 means little on its own, and
  // "46% of what you earned" is the number someone can act on.
  const rate = summary.income > 0 ? summary.saved / summary.income : 0;
  const overspent = summary.saved < 0;
  const percent = Math.round(Math.abs(rate) * 100);
  const accent = overspent ? theme.colors.negative : theme.colors.brand;

  return (
    <Card radius="xl" padding="xl">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
        <View style={{ flex: 1, minWidth: 0, gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: overspent
                  ? theme.colors.negativeSurface
                  : theme.colors.brandSurface,
              }}
            >
              <Icon name="rupee" size={13} color={accent} strokeWidth={2.2} />
            </View>
            <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
              {overspent ? 'You overspent this period' : 'You saved this period'}
            </Text>
          </View>

          <Text variant="h1" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {formatINR(Math.abs(summary.saved))}
          </Text>
        </View>

        <ProgressRing
          value={overspent ? 1 : rate}
          size={96}
          thickness={11}
          color={accent}
          colorEnd={overspent ? accent : theme.colors.brandPressed}
          trackColor={theme.colors.surfaceMuted}
          gradientId="savingsRing"
          accessibilityLabel={`Savings rate ${percent} percent`}
        >
          <Text variant="h3" numberOfLines={1}>
            {`${percent}%`}
          </Text>
          <Text variant="caption" tone="tertiary">
            {overspent ? 'Over' : 'Saved'}
          </Text>
        </ProgressRing>
      </View>

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          overspent
            ? `You spent ${formatINR(summary.spent)} against ${formatINR(summary.income)} earned`
            : `${percent} percent of your income saved. Great job, you're on track.`
        }
        accessibilityHint="Opens your savings breakdown"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginTop: theme.spacing.lg,
          padding: theme.spacing.md,
          borderRadius: theme.radius.md,
          backgroundColor: overspent ? theme.colors.negativeSurface : theme.colors.brandSurface,
        }}
      >
        <Icon name="bulb" size={17} color={accent} strokeWidth={2} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text variant="labelSm" color={accent} numberOfLines={1}>
            {overspent
              ? `Spending is ${percent}% over your income`
              : `${percent}% of your income saved!`}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {overspent ? 'Trim a category to get back on track.' : "Great job! You're on track."}
          </Text>
        </View>
        <Icon name="chevronRight" size={15} color={theme.colors.textTertiary} />
      </Pressable>
    </Card>
  );
}
