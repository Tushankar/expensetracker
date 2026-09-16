import { View } from 'react-native';

import { Icon, Text, withAlpha, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';
import type { Paise } from '@/types/models';
import { formatINR, percentChange } from '@/utils/currency';

export type StatTileProps = {
  label: string;
  amount: Paise;
  previous: Paise;
  icon: IconName;
  /** Accent for the glyph and the delta. */
  color: string;
  /**
   * Whether a rise is good news. Income up is positive, spending up is not — the
   * delta's colour follows this, not the direction of the arrow.
   */
  riseIsGood: boolean;
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
  masked = false,
}: StatTileProps) {
  const theme = useTheme();

  const delta = percentChange(amount, previous);
  const rose = (delta ?? 0) > 0;
  const good = rose === riseIsGood;
  // Hero-scoped: this tile sits on the dark slab in both themes.
  const deltaColor = good ? theme.colors.heroPositive : theme.colors.heroNegative;

  const deltaText = delta === null ? null : `${rose ? '↑' : '↓'} ${Math.abs(delta).toFixed(0)}%`;

  return (
    <View
      accessible
      accessibilityLabel={
        delta === null
          ? `${label}, ${formatINR(amount)}`
          : `${label}, ${formatINR(amount)}, ${Math.abs(delta).toFixed(0)} percent ${
              rose ? 'up' : 'down'
            } on last month`
      }
      style={{
        flex: 1,
        minWidth: 0,
        gap: 6,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.heroTile,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.heroTileBorder,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(color, 0.18),
          }}
        >
          <Icon name={icon} size={12} color={color} strokeWidth={2.4} />
        </View>
        <Text
          variant="caption"
          color={theme.colors.heroTextMuted}
          numberOfLines={1}
          style={{ flex: 1, minWidth: 0 }}
        >
          {label}
        </Text>
      </View>

      <Text
        variant="amountSm"
        color={theme.colors.heroText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {masked ? '••••••' : formatINR(amount)}
      </Text>

      {deltaText && !masked ? (
        <Text variant="caption" color={deltaColor} numberOfLines={1}>
          {`${deltaText} `}
          <Text variant="caption" color={theme.colors.heroTextMuted}>
            vs last
          </Text>
        </Text>
      ) : (
        // Holds the row's height so the two tiles stay level whether or not there
        // is a previous period to compare against.
        <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
          {masked ? ' ' : 'no comparison yet'}
        </Text>
      )}
    </View>
  );
}
