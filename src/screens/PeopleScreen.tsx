import { useNavigation } from '@react-navigation/native';
import { Fragment, useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { usePeople, usePeopleSummary, type Person } from '@/api';
import { QueryState } from '@/components/data/QueryState';
import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  IconButton,
  Input,
  MerchantAvatar,
  PageHeader,
  Screen,
  Skeleton,
  Text,
  withAlpha,
} from '@/components/ui';
import { AddPersonSheet } from '@/screens/sheets/AddPersonSheet';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

/** Lines a divider up with the row's name rather than its avatar. */
const DIVIDER_INSET = 44 + 12;

/**
 * People: every rupee that is with someone else, or owed to someone else.
 *
 * The headline is the net position, because that is the only figure that answers
 * "am I up or down" — two gross totals side by side leave the person doing the
 * subtraction. Both halves are still there underneath it, since the net alone
 * hides that ₹0 can mean "nothing owed" or "₹5,000 each way".
 */
export function PeopleScreen() {
  const theme = useTheme();
  const navigation = useNavigation();

  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addSession, setAddSession] = useState(0);

  const peopleQuery = usePeople(search);
  const summaryQuery = usePeopleSummary();

  const people = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data]);
  const summary = summaryQuery.data;

  const owedToMe = summary?.totalOwedToMe ?? 0;
  const iOwe = summary?.totalIOwe ?? 0;
  const net = summary?.netBalance ?? 0;
  const peopleCount = summary?.peopleCount ?? 0;

  // The search field re-queries, so an empty list while searching means "no
  // match", not "no people" — and the field has to stay put either way.
  const searching = search.trim().length > 0;
  const hasAnyone = peopleCount > 0 || people.length > 0 || searching;

  const refreshing = peopleQuery.isRefetching || summaryQuery.isRefetching;

  function refresh() {
    void peopleQuery.refetch();
    void summaryQuery.refetch();
  }

  function openPerson(person: Person) {
    tapFeedback();
    navigation.navigate('PersonDetail', { id: person.id });
  }

  function openAdd() {
    setAddSession((current) => current + 1);
    setAddOpen(true);
  }

  const netTone = net > 0 ? theme.colors.positive : net < 0 ? theme.colors.negative : undefined;

  return (
    <>
      <Screen
        bottomInset={theme.spacing.xxl}
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
          subtitle="Money lent, borrowed and covered"
          onBack={() => navigation.goBack()}
          action={
            <IconButton
              name="plus"
              accessibilityLabel="Add a person"
              accessibilityHint="Opens the new person sheet"
              variant="surface"
              onPress={openAdd}
            />
          }
        />

        <LinearGradient
          colors={[theme.colors.heroSurface, theme.colors.heroSurfaceEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[
            theme.shadows.md,
            {
              borderRadius: theme.radius.xl,
              borderWidth: theme.layout.hairline,
              borderColor: theme.colors.heroBorder,
              borderTopColor: 'rgba(255, 255, 255, 0.16)',
              overflow: 'hidden',
              padding: theme.spacing.xl,
            },
          ]}
        >
          <PeopleBloom color={netTone ?? theme.colors.brandText} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="users" size={15} color={theme.colors.heroTextMuted} strokeWidth={2} />
            <Text
              variant="overline"
              color={theme.colors.heroTextMuted}
              numberOfLines={1}
              style={{ flex: 1, minWidth: 0 }}
            >
              Net position
            </Text>
            <Badge
              label={net > 0 ? 'In your favour' : net < 0 ? 'You owe more' : 'Settled up'}
              tone={net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral'}
            />
          </View>

          <Text
            variant="amountLg"
            color={netTone ?? theme.colors.heroText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ marginTop: theme.spacing.md }}
          >
            {net === 0
              ? formatINR(0)
              : formatINR(Math.abs(net), { signed: true, negative: net < 0 })}
          </Text>

          <Text
            variant="caption"
            color={theme.colors.heroTextMuted}
            numberOfLines={1}
            style={{ marginTop: 2 }}
          >
            {peopleCount === 0
              ? 'No one tracked yet'
              : `across ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`}
          </Text>

          <View
            style={{
              height: theme.layout.hairline,
              backgroundColor: theme.colors.heroTileBorder,
              marginVertical: theme.spacing.lg,
            }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.lg }}>
            <HeroSide
              label="You are owed"
              amount={owedToMe}
              color={theme.colors.heroPositive}
              icon="arrowDownLeft"
            />
            <View
              style={{
                width: theme.layout.hairline,
                alignSelf: 'stretch',
                backgroundColor: theme.colors.heroTileBorder,
              }}
            />
            <HeroSide
              label="You owe"
              amount={iOwe}
              color={theme.colors.heroNegative}
              icon="arrowUpRight"
            />
          </View>
        </LinearGradient>

        {hasAnyone ? (
          <View style={{ marginTop: theme.spacing.xl }}>
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name"
              leftIcon="search"
              autoCorrect={false}
              returnKeyType="search"
              rightSlot={
                searching ? (
                  <Pressable
                    onPress={() => setSearch('')}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    hitSlop={10}
                  >
                    <Icon name="close" size={16} color={theme.colors.textTertiary} />
                  </Pressable>
                ) : null
              }
            />
          </View>
        ) : null}

        <View style={{ marginTop: theme.spacing.xl }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: theme.spacing.md,
              marginBottom: theme.spacing.sm,
            }}
          >
            <Text variant="overline" tone="tertiary" style={{ flex: 1, minWidth: 0 }}>
              {searching ? `Matches (${people.length})` : 'Everyone'}
            </Text>
            {people.length > 0 ? (
              <Text variant="caption" tone="tertiary">
                {`${people.length} ${people.length === 1 ? 'person' : 'people'}`}
              </Text>
            ) : null}
          </View>

          <QueryState
            isLoading={peopleQuery.isLoading}
            error={peopleQuery.error}
            onRetry={refresh}
            fill={false}
            loadingFallback={
              <Card padding="lg" radius="xl">
                <View style={{ gap: theme.spacing.md }}>
                  <Skeleton height={44} radius={theme.radius.sm} />
                  <Skeleton height={44} radius={theme.radius.sm} />
                  <Skeleton height={44} radius={theme.radius.sm} />
                </View>
              </Card>
            }
          >
            {people.length === 0 ? (
              <Card variant="outlined" radius="xl" padding="xl">
                <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: theme.radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: withAlpha(theme.colors.brandText, 0.12),
                      borderWidth: theme.layout.hairline,
                      borderColor: withAlpha(theme.colors.brandText, 0.22),
                    }}
                  >
                    <Icon name="users" size={24} color={theme.colors.brandText} strokeWidth={1.9} />
                  </View>

                  <Text variant="label" align="center">
                    {searching ? 'No one matches that name' : 'No one here yet'}
                  </Text>
                  <Text variant="bodySm" tone="secondary" align="center" style={{ lineHeight: 20 }}>
                    {searching
                      ? 'Check the spelling, or clear the search to see everyone.'
                      : 'Add someone you lend to or borrow from, and Paisa keeps the running total on both sides.'}
                  </Text>

                  {searching ? (
                    <Button
                      label="Clear search"
                      variant="secondary"
                      size="sm"
                      onPress={() => setSearch('')}
                      style={{ marginTop: theme.spacing.xs }}
                    />
                  ) : (
                    <Button
                      label="Add a person"
                      leftIcon="plus"
                      variant="brand"
                      size="md"
                      onPress={openAdd}
                      style={{ marginTop: theme.spacing.sm }}
                    />
                  )}
                </View>
              </Card>
            ) : (
              <Card padding={0} radius="xl">
                <View style={{ paddingHorizontal: theme.spacing.lg }}>
                  {people.map((person, index) => (
                    <Fragment key={person.id}>
                      {index > 0 ? <Divider inset={DIVIDER_INSET} /> : null}
                      <PersonRow person={person} onPress={() => openPerson(person)} />
                    </Fragment>
                  ))}
                </View>
              </Card>
            )}
          </QueryState>
        </View>
      </Screen>

      <AddPersonSheet
        key={`people-add-sheet-${addSession}`}
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(person) => navigation.navigate('PersonDetail', { id: person.id })}
      />
    </>
  );
}

/** One half of the hero's owed / owing split. */
function HeroSide({
  label,
  amount,
  color,
  icon,
}: {
  label: string;
  amount: number;
  color: string;
  icon: 'arrowDownLeft' | 'arrowUpRight';
}) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${formatINR(amount)}`}
      style={{ flex: 1, minWidth: 0, gap: 5 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(color, 0.18),
          }}
        >
          <Icon name={icon} size={11} color={color} strokeWidth={2.6} />
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
        variant="amount"
        color={amount > 0 ? theme.colors.heroText : theme.colors.heroTextMuted}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {formatINR(amount)}
      </Text>
    </View>
  );
}

/**
 * One person, netted.
 *
 * The row leads with the net because that is what settling up would cost. When
 * money has gone both ways the two gross figures follow underneath, so a net of
 * zero is never mistaken for nothing having happened.
 */
function PersonRow({ person, onPress }: { person: Person; onPress: () => void }) {
  const theme = useTheme();

  const net = person.totalOwedToMe - person.totalIOwe;
  const bothWays = person.totalOwedToMe > 0 && person.totalIOwe > 0;
  const tone =
    net > 0 ? theme.colors.positive : net < 0 ? theme.colors.negative : theme.colors.textTertiary;

  const detail = bothWays
    ? `${formatINR(person.totalOwedToMe)} out · ${formatINR(person.totalIOwe)} in`
    : person.activeObligationsCount > 0
      ? `${person.activeObligationsCount} open ${person.activeObligationsCount === 1 ? 'item' : 'items'}`
      : (person.phone ?? 'Nothing outstanding');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        person.name,
        net > 0
          ? `owes you ${formatINR(net)}`
          : net < 0
            ? `you owe ${formatINR(Math.abs(net))}`
            : 'settled up',
        detail,
      ].join(', ')}
      accessibilityHint="Opens their history"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: 64,
        paddingVertical: theme.spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <MerchantAvatar name={person.name} size={44} />

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="label" numberOfLines={1}>
          {person.name}
        </Text>
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {detail}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text variant="amountSm" color={tone} numberOfLines={1}>
          {net === 0
            ? 'Settled'
            : formatINR(Math.abs(net), { signed: true, negative: net < 0 })}
        </Text>
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {net > 0 ? 'owes you' : net < 0 ? 'you owe' : 'all clear'}
        </Text>
      </View>

      <Icon name="chevronRight" size={17} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

/** Atmosphere on the slab, tinted by which way the balance leans. */
function PeopleBloom({ color }: { color: string }) {
  return (
    <Svg
      width={280}
      height={200}
      style={styles.bloom}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="peopleBloom" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.2} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.05} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={200} cy={55} rx={130} ry={95} fill="url(#peopleBloom)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bloom: { position: 'absolute', top: -36, right: -36, pointerEvents: 'none' },
});
