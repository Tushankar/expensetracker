import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { usePeople, usePeopleSummary, type Person } from '@/api';
import { QueryState } from '@/components/data/QueryState';
import {
  Card,
  Divider,
  Input,
  ListRow,
  PageHeader,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
} from '@/components/ui';
import { IconTile } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

const DIVIDER_INSET = 44 + 12;

export function PeopleScreen() {
  const theme = useTheme();
  const navigation = useNavigation();

  const [search, setSearch] = useState('');
  const peopleQuery = usePeople(search);
  const summaryQuery = usePeopleSummary();

  const people = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data]);
  const summary = summaryQuery.data;

  const totalOwedToMe = summary?.totalOwedToMe ?? 0;
  const totalIOwe = summary?.totalIOwe ?? 0;

  const refreshing = peopleQuery.isRefetching || summaryQuery.isRefetching;

  function refresh() {
    void peopleQuery.refetch();
    void summaryQuery.refetch();
  }

  function openPerson(person: Person) {
    tapFeedback();
    navigation.navigate('PersonDetail', { id: person.id });
  }

  return (
    <Screen
      bottomInset={theme.spacing.xl}
      testID="people-screen"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={theme.colors.textTertiary}
          colors={[theme.colors.brand]}
          progressBackgroundColor={theme.colors.surface}
        />
      }
    >
      <PageHeader
        title="People"
        subtitle="Track money owed, loans and repayments"
      />

      {/* Summary Cards: You are owed vs You owe */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
        <Card
          padding="lg"
          radius="xl"
          style={{
            flex: 1,
            backgroundColor: theme.colors.positiveSurface,
            borderColor: theme.colors.positive,
          }}
        >
          <Text variant="caption" tone="positive">
            YOU ARE OWED
          </Text>
          <Text
            variant="h3"
            tone="positive"
            style={{ marginTop: theme.spacing.xs }}
          >
            {formatINR(totalOwedToMe)}
          </Text>
        </Card>

        <Card
          padding="lg"
          radius="xl"
          style={{
            flex: 1,
            backgroundColor: theme.colors.negativeSurface,
            borderColor: theme.colors.negative,
          }}
        >
          <Text variant="caption" tone="negative">
            YOU OWE
          </Text>
          <Text
            variant="h3"
            tone="negative"
            style={{ marginTop: theme.spacing.xs }}
          >
            {formatINR(totalIOwe)}
          </Text>
        </Card>
      </View>

      {/* Search Input */}
      <View style={{ marginTop: theme.spacing.lg }}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name..."
          leftIcon="search"
        />
      </View>

      {/* People Directory List */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <SectionHeader
          title={`All people (${people.length})`}
        />

        <Card padding={0} radius="xl">
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            <QueryState
              isLoading={peopleQuery.isLoading}
              error={peopleQuery.error}
              isEmpty={people.length === 0}
              onRetry={refresh}
              fill={false}
              loadingFallback={
                <View style={{ paddingVertical: theme.spacing.md }}>
                  <Skeleton height={56} radius={theme.radius.md} style={{ marginBottom: theme.spacing.sm }} />
                  <Skeleton height={56} radius={theme.radius.md} style={{ marginBottom: theme.spacing.sm }} />
                  <Skeleton height={56} radius={theme.radius.md} />
                </View>
              }
              empty={{
                icon: 'user',
                title: search ? 'No one matches that name' : 'No people added yet',
                description: search
                  ? 'Check spelling or clear search'
                  : 'Add a loan, borrow, or paid-for entry to start tracking.',
              }}
            >
              {people.map((person, index) => {
                const netBalance = person.totalOwedToMe - person.totalIOwe;
                const isPositive = netBalance > 0;
                const isNegative = netBalance < 0;

                return (
                  <View key={person.id}>
                    {index > 0 ? <Divider inset={DIVIDER_INSET} /> : null}
                    <ListRow
                      title={person.name}
                      subtitle={
                        person.phone
                          ? person.phone
                          : `${person.activeObligationsCount} active obligation${person.activeObligationsCount === 1 ? '' : 's'}`
                      }
                      leading={
                        <IconTile
                          name="user"
                          color={isPositive ? theme.colors.brand : isNegative ? '#EF4444' : theme.colors.textTertiary}
                        />
                      }
                      trailing={
                        <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                          {isPositive ? (
                            <Text variant="label" style={{ color: '#10B981' }}>
                              +{formatINR(person.totalOwedToMe)}
                            </Text>
                          ) : isNegative ? (
                            <Text variant="label" style={{ color: '#EF4444' }}>
                              -{formatINR(person.totalIOwe)}
                            </Text>
                          ) : (
                            <Text variant="label" tone="tertiary">
                              Settled
                            </Text>
                          )}
                          <Text variant="caption" tone="tertiary">
                            {isPositive
                              ? 'Owes you'
                              : isNegative
                                ? 'You owe'
                                : 'All clear'}
                          </Text>
                        </View>
                      }
                      showChevron
                      onPress={() => openPerson(person)}
                    />
                  </View>
                );
              })}
            </QueryState>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
