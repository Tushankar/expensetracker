import { View } from 'react-native';

import { BarChart } from '@/components/charts';
import { Icon, Text, withAlpha, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';
import type { Paise } from '@/types/models';
import { formatINR, percentChange } from '@/utils/currency';

export type StatTileProps = {
  label: string;
  amount: Paise;
  previous: Paise;
  icon: IconName;
  /** Accent for the glyph, the delta and the thumbnail bars. */
  color: string;
  /**
   * Whether a rise is good news. Income up is positive, spending up is not — the
   * delta's colour follows this, not the direction of the arrow.
   */
  riseIsGood: boolean;
  /** Shape-only series for the thumbnail chart. */
  trend: readonly number[];
  /** Hides the figures behind dots when the balance is masked. */
  masked?: boolean;
};

/**
 * Income and Spent, the two tiles inside the balance card.
 *
 * The arrow always points the way the number moved; the colour says whether that
 * is good. Spending down is green even though the arrow points down, which is the
 * read someone actually wants.
 */
export function StatTile({
  label,
  amount,
  previous,
  icon,
  color,
  riseIsGood,
  trend,
  masked = false,
}: StatTileProps) {
  const theme = useTheme();

  const delta = percentChange(amount, previous);
  const rose = (delta ?? 0) > 0;
  const good = rose === riseIsGood;
  // Hero-scoped: this tile sits on the dark slab in both themes.
  const deltaColor = good ? theme.colors.heroPositive : theme.colors.heroNegative;

  const deltaText =
    delta === null ? null : `${rose ? '↑' : '↓'} ${Math.abs(delta).toFixed(0)}%`;

  return (
    <View
      accessible
      accessibilityLabel={
        delta === null
          ? `${label}, ${formatINR(amount)}`
          : `${label}, ${formatINR(amount)}, ${rose ? 'up' : 'down'} ${Math.abs(delta).toFixed(
              0,
            )} percent versus last month`
      }
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: theme.colors.heroTile,
        borderRadius: theme.radius.md,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.heroTileBorder,
        padding: theme.spacing.lg - 2,
        gap: theme.spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(color, 0.16),
          }}
        >
          <Icon name={icon} size={15} color={color} strokeWidth={2.4} />
        </View>

        <View style={{ flex: 1 }} />

        {/* Fixed width: the bars inside are flex children and would collapse to
            zero in an auto-sized box. */}
        <View style={{ width: 42 }}>
          <BarChart
            data={trend.map((value, index) => ({ label: `b${index}`, value }))}
            color={color}
            height={22}
            gap={3}
            barRadius={2}
            showLabels={false}
            accessibilityLabel=""
          />
        </View>
      </View>

      <Text variant="caption" color={theme.colors.heroTextMuted}>
        {label}
      </Text>

      <Text
        variant="amount"
        color={theme.colors.heroText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {masked ? '•••••' : formatINR(amount)}
      </Text>

      {deltaText ? (
        <Text variant="caption" color={deltaColor} numberOfLines={1}>
          {`${deltaText} `}
          <Text variant="caption" color={theme.colors.heroTextMuted}>
            vs last month
          </Text>
        </Text>
      ) : null}
    </View>
  );
}
