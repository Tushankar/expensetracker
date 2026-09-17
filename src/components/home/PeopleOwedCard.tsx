import { Pressable, View } from 'react-native';

import type { PeopleSummary } from '@/api/types';
import { Card, Icon, SectionHeader, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

export type PeopleOwedCardProps = {
  summary: PeopleSummary;
  onPress: () => void;
};

export function PeopleOwedCard({ summary, onPress }: PeopleOwedCardProps) {
  const theme = useTheme();
  const hasActive = summary.totalOwedToMe > 0 || summary.totalIOwe > 0;
  if (!hasActive) return null;

  return (
    <View>
      <SectionHeader title="People & Owed" actionLabel="View all" onActionPress={onPress} />
      <Card padding="md" radius="lg">
        <Pressable
          onPress={() => {
            tapFeedback();
            onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel="People and owed money overview"
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
            }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: theme.colors.positiveSurface,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                borderWidth: theme.layout.hairline,
                borderColor: theme.colors.positive,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="arrowDownLeft" size={14} color={theme.colors.positive} />
                <Text variant="caption" style={{ color: theme.colors.positive }}>
                  YOU ARE OWED
                </Text>
              </View>
              <Text variant="h3" tone="positive" style={{ marginTop: 4 }}>
                {formatINR(summary.totalOwedToMe)}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: theme.colors.negativeSurface,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                borderWidth: theme.layout.hairline,
                borderColor: theme.colors.negative,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="arrowUpRight" size={14} color={theme.colors.negative} />
                <Text variant="caption" style={{ color: theme.colors.negative }}>
                  YOU OWE
                </Text>
              </View>
              <Text variant="h3" tone="negative" style={{ marginTop: 4 }}>
                {formatINR(summary.totalIOwe)}
              </Text>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: theme.spacing.md,
              paddingTop: theme.spacing.sm,
              borderTopWidth: theme.layout.hairline,
              borderTopColor: theme.colors.border,
            }}
          >
            <Text variant="bodySm" tone="secondary">
              {summary.peopleCount} {summary.peopleCount === 1 ? 'person' : 'people'} with active balances
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text variant="label" tone={summary.netBalance >= 0 ? 'positive' : 'negative'}>
                Net {summary.netBalance >= 0 ? '+' : ''}
                {formatINR(summary.netBalance)}
              </Text>
              <Icon name="chevronRight" size={14} color={theme.colors.textTertiary} />
            </View>
          </View>
        </Pressable>
      </Card>
    </View>
  );
}
