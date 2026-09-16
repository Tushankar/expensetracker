import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type BadgeTone = 'neutral' | 'brand' | 'positive' | 'negative' | 'warning' | 'info';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  style?: ViewStyle;
};

/** Small status pill. Deliberately low-contrast so it labels without competing. */
export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const { colors, radius, spacing } = useTheme();

  const map: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
    brand: { bg: colors.brandSurface, fg: colors.brandText },
    positive: { bg: colors.positiveSurface, fg: colors.positive },
    negative: { bg: colors.negativeSurface, fg: colors.negative },
    warning: { bg: colors.warningSurface, fg: colors.warning },
    info: { bg: colors.infoSurface, fg: colors.info },
  };

  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: map[tone].bg,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.sm + 2,
          paddingVertical: spacing.xs + 1,
        },
        style,
      ]}
    >
      <Text variant="caption" color={map[tone].fg} numberOfLines={1} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </View>
  );
}
