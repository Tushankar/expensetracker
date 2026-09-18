import { View } from 'react-native';

import { Icon, Text, withAlpha } from '@/components/ui';
import { useTheme } from '@/theme';
import type { Paise } from '@/types/models';
import { formatINR, percentChange } from '@/utils/currency';

export type FlowStatProps = {
  label: string;
  amount: Paise;
  previous: Paise;
  /** Matches this side's segment of the flow rail above it. */
  color: string;
  /** This side's share of the period's total movement, 0–1. */
  share: number;
  /**
   * Whether a rise is good news. Income up is positive, spending up is not — the
   * delta's colour follows this, not the direction of the arrow.
   */
  riseIsGood: boolean;
  /** Hides the figures behind dots when the balance is masked. */
  masked?: boolean;
};

/**
 * One side of the money-in / money-out pair under the balance.
 *
 * No tile, no border: the rail directly above already groups these two, and a
 * filled box around each one only competed with the balance figure. The dot is
 * what ties the column to its segment of the rail.
 */
export function FlowStat({
  label,
  amount,
  previous,
  color,
  share,
  riseIsGood,
  masked = false,
}: FlowStatProps) {
  const theme = useTheme();

  const delta = percentChange(amount, previous);
  const rose = (delta ?? 0) > 0;
  const good = rose === riseIsGood;
  // Hero-scoped: this sits on the dark slab in every accent.
  const deltaColor = good ? theme.colors.heroPositive : theme.colors.heroNegative;
  const sharePercent = Math.round(share * 100);

  return (
    <View
      accessible
      accessibilityLabel={[
        `${label}, ${formatINR(amount)}`,
        `${sharePercent} percent of this period's movement`,
        delta === null
          ? 'no previous period to compare'
          : `${Math.abs(delta).toFixed(0)} percent ${rose ? 'up' : 'down'} on last period`,
      ].join(', ')}
      style={{ flex: 1, minWidth: 0, gap: 5 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
          {label}
        </Text>
        {share > 0 && !masked ? (
          <Text variant="caption" color={theme.colors.heroTextMuted} style={{ opacity: 0.7 }}>
            {`${sharePercent}%`}
          </Text>
        ) : null}
      </View>

      <Text
        variant="amount"
        color={theme.colors.heroText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {masked ? '••••••' : formatINR(amount)}
      </Text>

      {/* The row holds its height either way, so the two columns stay level
          whether or not there is a previous period to compare against. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 20 }}>
        {delta === null || masked ? (
          <>
            <View
              style={{
                width: 10,
                height: theme.layout.hairline,
                backgroundColor: theme.colors.heroTextMuted,
                opacity: 0.6,
              }}
            />
            <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
              {masked ? ' ' : 'first period'}
            </Text>
          </>
        ) : (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 2,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: theme.radius.pill,
                backgroundColor: withAlpha(deltaColor, 0.16),
              }}
            >
              <Icon
                name={rose ? 'trendingUp' : 'trendingDown'}
                size={11}
                color={deltaColor}
                strokeWidth={2.4}
              />
              <Text variant="caption" color={deltaColor} maxFontSizeMultiplier={1.3}>
                {`${Math.abs(delta).toFixed(0)}%`}
              </Text>
            </View>
            <Text
              variant="caption"
              color={theme.colors.heroTextMuted}
              numberOfLines={1}
              style={{ flex: 1, minWidth: 0 }}
            >
              vs last
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
