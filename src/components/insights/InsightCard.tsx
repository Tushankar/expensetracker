import { View } from 'react-native';

import type { AiInsight } from '@/api/types';
import { Card, Icon, Text, type IconName } from '@/components/ui';
import { useTheme, type Theme } from '@/theme';

export type InsightCardProps = {
  insight: AiInsight;
};

const TONE_ICON: Record<AiInsight['tone'], IconName> = {
  warning: 'alertTriangle',
  positive: 'trendingUp',
  neutral: 'info',
};

function toneColor(tone: AiInsight['tone'], theme: Theme): string {
  switch (tone) {
    case 'warning':
      return theme.colors.warning;
    case 'positive':
      return theme.colors.positive;
    default:
      return theme.colors.info;
  }
}

/**
 * One observation.
 *
 * A card rather than a paragraph, because the tone has to be legible before the
 * words are: "a budget is over" and "you kept more than last month" should not
 * look the same at a glance. The category chip is only rendered when the server
 * verified it against the user's real categories, so it can never point at
 * something that does not exist.
 */
export function InsightCard({ insight }: InsightCardProps) {
  const theme = useTheme();
  const accent = toneColor(insight.tone, theme);

  return (
    <Card
      variant="outlined"
      radius="lg"
      padding="lg"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <View
        accessible
        accessibilityLabel={`${insight.title}. ${insight.body}`}
        style={{ gap: theme.spacing.sm }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Icon name={TONE_ICON[insight.tone]} size={15} color={accent} strokeWidth={2.2} />
          <Text variant="labelSm" color={accent} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
            {insight.title}
          </Text>
          {insight.category ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {insight.category}
            </Text>
          ) : null}
        </View>

        <Text variant="bodySm" tone="secondary" style={{ lineHeight: 20 }}>
          {insight.body}
        </Text>
      </View>
    </Card>
  );
}
