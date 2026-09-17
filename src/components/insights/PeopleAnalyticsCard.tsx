import { Fragment } from 'react';
import { Pressable, View } from 'react-native';

import type { PeopleAnalytics } from '@/api/types';
import { Card, Divider, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

export type PeopleAnalyticsCardProps = {
  peopleSummary: PeopleAnalytics;
  onViewAll?: () => void;
  onPersonPress?: (personId: string) => void;
};

export function PeopleAnalyticsCard({
  peopleSummary,
  onViewAll,
  onPersonPress,
}: PeopleAnalyticsCardProps) {
  const theme = useTheme();

  const { totalOwedToMe, totalIOwe, people = [] } = peopleSummary;
  const hasBalances = totalOwedToMe > 0 || totalIOwe > 0;
  const activePeople = people.filter((p) => p.balance > 0);

  if (!hasBalances && activePeople.length === 0) {
    return null;
  }

  return (
    <Card padding={0} radius="xl">
      <View style={{ padding: theme.spacing.lg }}>
        {/* You Are Owed / You Owe Grid */}
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <View
            style={{
              flex: 1,
              backgroundColor: theme.colors.positiveSurface,
              padding: theme.spacing.md,
              borderRadius: theme.radius.lg,
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
              {formatINR(totalOwedToMe)}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: theme.colors.negativeSurface,
              padding: theme.spacing.md,
              borderRadius: theme.radius.lg,
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
              {formatINR(totalIOwe)}
            </Text>
          </View>
        </View>

        {/* People balance rows */}
        {activePeople.length > 0 ? (
          <View style={{ marginTop: theme.spacing.md }}>
            {activePeople.slice(0, 5).map((person, index) => {
              const isTheyOwe = person.direction === 'they_owe';
              return (
                <Fragment key={person.id}>
                  {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
                  <Pressable
                    onPress={() => {
                      tapFeedback();
                      onPersonPress?.(person.id);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.md,
                      paddingVertical: theme.spacing.sm,
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: isTheyOwe
                          ? theme.colors.positiveSurface
                          : theme.colors.negativeSurface,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        variant="labelSm"
                        style={{ color: isTheyOwe ? theme.colors.positive : theme.colors.negative }}
                      >
                        {person.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label" numberOfLines={1}>
                        {person.name}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        {isTheyOwe ? 'Owes you' : 'You owe'}
                      </Text>
                    </View>

                    <Text
                      variant="labelSm"
                      style={{ color: isTheyOwe ? theme.colors.positive : theme.colors.negative }}
                    >
                      {isTheyOwe ? '+' : '−'}
                      {formatINR(person.balance)}
                    </Text>
                  </Pressable>
                </Fragment>
              );
            })}
          </View>
        ) : null}

        {onViewAll && activePeople.length > 0 ? (
          <Pressable
            onPress={() => {
              tapFeedback();
              onViewAll();
            }}
            style={{
              alignItems: 'center',
              paddingTop: theme.spacing.sm,
              marginTop: theme.spacing.xs,
              borderTopWidth: theme.layout.hairline,
              borderTopColor: theme.colors.border,
            }}
          >
            <Text variant="labelSm" tone="brand">
              Manage People & Obligations →
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}
