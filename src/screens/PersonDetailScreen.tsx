import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import {
  useCreateMoneyOwed,
  useDeletePerson,
  useMoneyOwedList,
  usePerson,
  useRecordRepayment,
  useWriteOffObligation,
  type MoneyOwed,
} from '@/api';
import {
  Badge,
  Button,
  Card,
  IconButton,
  PageHeader,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';
import { AddMoneyOwedSheet } from '@/screens/sheets/AddMoneyOwedSheet';
import { RepaymentSheet } from '@/screens/sheets/RepaymentSheet';
import { useUiStore } from '@/store/uiStore';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';
import { errorFeedback, successFeedback, tapFeedback } from '@/utils/haptics';

export function PersonDetailScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'PersonDetail'>>();
  const personId = route.params.id;

  const showToast = useUiStore((state) => state.showToast);

  const personQuery = usePerson(personId);
  const obligationsQuery = useMoneyOwedList({ personId });

  const createMoneyOwed = useCreateMoneyOwed();
  const recordRepayment = useRecordRepayment();
  const writeOff = useWriteOffObligation();
  const deletePerson = useDeletePerson();

  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [activeRepayObligation, setActiveRepayObligation] = useState<MoneyOwed | null>(null);

  const person = personQuery.data;
  const obligations = useMemo(() => obligationsQuery.data ?? [], [obligationsQuery.data]);

  const activeObligations = obligations.filter((o) => o.status === 'active');
  const pastObligations = obligations.filter((o) => o.status !== 'active');

  const totalOwedToMe = person?.totalOwedToMe ?? 0;
  const totalIOwe = person?.totalIOwe ?? 0;
  const net = totalOwedToMe - totalIOwe;

  const refreshing = personQuery.isRefetching || obligationsQuery.isRefetching;

  function refresh() {
    void personQuery.refetch();
    void obligationsQuery.refetch();
  }

  function handleAddMoney() {
    tapFeedback();
    setAddSheetOpen(true);
  }

  function handleRecordRepayment(obligation: MoneyOwed) {
    tapFeedback();
    setActiveRepayObligation(obligation);
  }

  function handleWriteOff(obligation: MoneyOwed) {
    tapFeedback();
    const formatted = formatINR(obligation.remainingAmount);
    Alert.alert(
      'Write Off Obligation',
      `Write off ${formatted} owed by ${person?.name}?\n\nWriting this off will mark the amount as no longer collectible without silently deleting financial history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Write Off',
          style: 'destructive',
          onPress: async () => {
            try {
              await writeOff.mutateAsync({ id: obligation.id, note: 'Written off by user' });
              successFeedback();
              showToast({ message: 'Obligation written off', tone: 'neutral' });
              refresh();
            } catch (err: unknown) {
              errorFeedback();
              showToast({
                message: 'Could not write off',
                detail: err instanceof Error ? err.message : undefined,
                tone: 'error',
              });
            }
          },
        },
      ],
    );
  }

  function handleDeletePerson() {
    tapFeedback();
    if (activeObligations.length > 0) {
      Alert.alert(
        'Cannot Delete Person',
        'This person has active obligations. Settle or write them off before deleting.',
      );
      return;
    }

    Alert.alert(
      'Delete Person',
      `Are you sure you want to delete ${person?.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePerson.mutateAsync(personId);
              successFeedback();
              showToast({ message: 'Person deleted' });
              navigation.goBack();
            } catch (err: unknown) {
              errorFeedback();
              showToast({
                message: 'Could not delete',
                detail: err instanceof Error ? err.message : undefined,
                tone: 'error',
              });
            }
          },
        },
      ],
    );
  }

  return (
    <Screen
      bottomInset={theme.spacing.xl}
      testID="person-detail-screen"
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
        title={person?.name ?? 'Person'}
        subtitle={person?.phone || person?.email || undefined}
        onBack={() => navigation.goBack()}
        action={
          <IconButton
            name="trash"
            size="sm"
            accessibilityLabel="Delete person"
            onPress={handleDeletePerson}
          />
        }
      />

      {/* Hero Balance Card */}
      <View style={{ marginTop: theme.spacing.lg }}>
        <Card
          padding="xl"
          radius="xl"
          style={{
            backgroundColor:
              net > 0
                ? theme.colors.positiveSurface
                : net < 0
                  ? theme.colors.negativeSurface
                  : theme.colors.surface,
          }}
        >
          <Text variant="caption" tone={net > 0 ? 'positive' : net < 0 ? 'negative' : 'secondary'}>
            {net > 0 ? 'YOU ARE OWED' : net < 0 ? 'YOU OWE' : 'BALANCE'}
          </Text>
          <Text
            variant="display"
            tone={net > 0 ? 'positive' : net < 0 ? 'negative' : 'primary'}
            style={{ marginTop: theme.spacing.xs }}
          >
            {formatINR(Math.abs(net))}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              borderTopWidth: theme.layout.hairline,
              borderTopColor: theme.colors.divider,
            }}
          >
            <View>
              <Text variant="caption" tone="tertiary">
                Total Lent / Paid
              </Text>
              <Text variant="label" tone="positive" style={{ marginTop: 2 }}>
                {formatINR(totalOwedToMe)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="caption" tone="tertiary">
                Total Borrowed
              </Text>
              <Text variant="label" tone="negative" style={{ marginTop: 2 }}>
                {formatINR(totalIOwe)}
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Main Action Buttons */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
        <View style={{ flex: 1 }}>
          <Button
            label="+ Add Money"
            variant="primary"
            size="md"
            onPress={handleAddMoney}
          />
        </View>
        {activeObligations.length > 0 ? (
          <View style={{ flex: 1 }}>
            <Button
              label="Record Repayment"
              variant="secondary"
              size="md"
              onPress={() => handleRecordRepayment(activeObligations[0]!)}
            />
          </View>
        ) : null}
      </View>

      {/* Active Obligations */}
      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader title={`Active obligations (${activeObligations.length})`} />
        {activeObligations.length === 0 ? (
          <Card padding="lg" radius="lg">
            <Text tone="secondary" style={{ textAlign: 'center' }}>
              No active obligations with {person?.name}. All settled!
            </Text>
          </Card>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {activeObligations.map((o) => (
              <Card key={o.id} padding="lg" radius="xl">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                      <Badge
                        label={
                          o.type === 'paid_for'
                            ? 'Paid for them'
                            : o.direction === 'owed_to_me'
                              ? 'Lent'
                              : 'Borrowed'
                        }
                        tone={o.direction === 'owed_to_me' ? 'positive' : 'negative'}
                      />
                      <Text variant="caption" tone="tertiary">
                        {formatDayLabel(o.createdAt)}
                      </Text>
                    </View>

                    <Text variant="h3" style={{ marginTop: theme.spacing.sm }}>
                      {o.purpose}
                    </Text>

                    {o.note ? (
                      <Text variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                        {o.note}
                      </Text>
                    ) : null}
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="h3">
                      {formatINR(o.remainingAmount)}
                    </Text>
                    {o.remainingAmount !== o.originalAmount ? (
                      <Text variant="caption" tone="tertiary">
                        of {formatINR(o.originalAmount)}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Actions per obligation */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    gap: theme.spacing.sm,
                    marginTop: theme.spacing.md,
                    paddingTop: theme.spacing.sm,
                    borderTopWidth: theme.layout.hairline,
                    borderTopColor: theme.colors.divider,
                  }}
                >
                  <Button
                    label="Write off"
                    variant="ghost"
                    size="sm"
                    onPress={() => handleWriteOff(o)}
                  />
                  <Button
                    label="Repay"
                    variant="secondary"
                    size="sm"
                    onPress={() => handleRecordRepayment(o)}
                  />
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>

      {/* Past / Settled Obligations */}
      {pastObligations.length > 0 ? (
        <View style={{ marginTop: theme.spacing.xxl }}>
          <SectionHeader title={`Settled & Written Off (${pastObligations.length})`} />
          <View style={{ gap: theme.spacing.sm }}>
            {pastObligations.map((o) => (
              <Card key={o.id} padding="md" radius="lg">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                      <Badge
                        label={o.status === 'settled' ? 'Settled' : 'Written off'}
                        tone="neutral"
                      />
                      <Text variant="label">{o.purpose}</Text>
                    </View>
                    <Text variant="caption" tone="tertiary" style={{ marginTop: 2 }}>
                      Original: {formatINR(o.originalAmount)} • {formatDayLabel(o.createdAt)}
                    </Text>
                  </View>
                  <Text variant="label" tone="tertiary">
                    {formatINR(0)}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        </View>
      ) : null}

      {/* Add Money Owed Sheet */}
      {person ? (
        <AddMoneyOwedSheet
          visible={addSheetOpen}
          onClose={() => setAddSheetOpen(false)}
          personId={person.id}
          personName={person.name}
          onSave={async (input) => {
            await createMoneyOwed.mutateAsync(input);
            showToast({ message: 'Obligation created', tone: 'success' });
            refresh();
          }}
        />
      ) : null}

      {/* Record Repayment Sheet */}
      {activeRepayObligation && person ? (
        <RepaymentSheet
          visible={Boolean(activeRepayObligation)}
          onClose={() => setActiveRepayObligation(null)}
          personName={person.name}
          obligationId={activeRepayObligation.id}
          remainingAmount={activeRepayObligation.remainingAmount}
          direction={activeRepayObligation.direction}
          onRecord={async (input) => {
            await recordRepayment.mutateAsync({ id: activeRepayObligation.id, input });
            showToast({ message: 'Repayment recorded', tone: 'success' });
            refresh();
          }}
        />
      ) : null}
    </Screen>
  );
}
