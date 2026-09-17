import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  errorMessage,
  useAccountMap,
  useCategoryMap,
  useDeleteReceipt,
  useDeleteTransaction,
  useReceiptStatus,
  useReceipts,
  useTransaction,
  useUploadReceipt,
  PAYMENT_METHOD_LABEL,
} from '@/api';
import { QueryState } from '@/components/data/QueryState';
import { ReceiptCard } from '@/components/entry';
import { toIconName } from '@/components/icons/registry';
import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  IconTile,
  MerchantAvatar,
  Screen,
  Text,
} from '@/components/ui';
import { merchantDomain } from '@/data/merchants';
import type { RootStackParamList } from '@/navigation/types';
import { useUiStore } from '@/store/uiStore';
import { categoryColor, useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { formatDayLabel, formatTime } from '@/utils/date';
import { errorFeedback, successFeedback, tapFeedback } from '@/utils/haptics';

/**
 * One transaction, in full.
 *
 * A transfer is presented as a movement between two accounts rather than as a
 * signed amount, because that is what it is: the headline shows "HDFC → Cash" and
 * the figure carries no sign, so nothing on this screen suggests the money left.
 */
export function TransactionDetailScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'TransactionDetail'>>();
  const openEditSheet = useUiStore((state) => state.openEditSheet);

  const receiptStatus = useReceiptStatus();
  const receiptsQuery = useReceipts(route.params.id);
  const uploadReceipt = useUploadReceipt();
  const removeReceipt = useDeleteReceipt();

  const receipt = receiptsQuery.data?.[0] ?? null;

  /**
   * Attaches a bill to a transaction that already exists.
   *
   * The counterpart to the entry sheet's flow, and the reason a receipt carries a
   * nullable `transactionId`: people photograph the bill at the counter and file
   * it later just as often as they do it the other way round.
   */
  async function attachReceipt() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access is off', 'Paisa needs it to attach a bill.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;

    try {
      await uploadReceipt.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType,
        transactionId: route.params.id,
      });
      successFeedback();
    } catch {
      errorFeedback();
    }
  }

  function confirmRemoveReceipt() {
    if (!receipt) return;
    tapFeedback();
    Alert.alert('Remove this receipt?', 'The image is deleted. The transaction stays.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeReceipt.mutate(receipt.id),
      },
    ]);
  }

  const [deleteError, setDeleteError] = useState<string | undefined>();

  const query = useTransaction(route.params.id);
  const categories = useCategoryMap();
  const accounts = useAccountMap();
  const remove = useDeleteTransaction();

  const transaction = query.data;
  const category = transaction?.categoryId ? categories.get(transaction.categoryId) : undefined;
  const account = transaction ? accounts.get(transaction.accountId) : undefined;
  const destination = transaction?.destinationAccountId
    ? accounts.get(transaction.destinationAccountId)
    : undefined;

  const isTransfer = transaction?.type === 'transfer';
  const isIncome = transaction?.type === 'income';

  function confirmDelete() {
    if (!transaction) return;

    Alert.alert(
      'Delete this transaction?',
      isTransfer
        ? 'Both account balances will be put back the way they were.'
        : 'The account balance will be put back the way it was.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeleteError(undefined);
            remove.mutate(transaction.id, {
              onSuccess() {
                successFeedback();
                navigation.goBack();
              },
              onError(error) {
                errorFeedback();
                setDeleteError(errorMessage(error));
              },
            });
          },
        },
      ],
    );
  }

  const title =
    transaction?.merchant || (isTransfer ? 'Transfer' : (category?.name ?? 'Transaction'));

  const accent = isTransfer
    ? theme.colors.textTertiary
    : categoryColor(category?.color ?? 'other');

  return (
    <Screen topInset={false} bottomInset={theme.spacing.xxl} testID="transaction-detail">
      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {transaction ? (
          <>
            <Card radius="xl" padding="xl" style={{ marginTop: theme.spacing.sm }}>
              <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
                {isTransfer ? (
                  <IconTile name="repeat" color={accent} size="lg" />
                ) : (
                  <MerchantAvatar name={title} domain={merchantDomain(title)} size={56} />
                )}

                <Text variant="h3" align="center" numberOfLines={2}>
                  {title}
                </Text>

                <Text
                  variant="displayLg"
                  tone={isIncome ? 'positive' : 'primary'}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {isTransfer
                    ? formatINR(transaction.amount)
                    : formatINR(transaction.amount, { signed: true, negative: !isIncome })}
                </Text>

                <Badge
                  label={
                    isTransfer ? 'Transfer between your accounts' : isIncome ? 'Income' : 'Expense'
                  }
                  tone={isTransfer ? 'neutral' : isIncome ? 'positive' : 'brand'}
                />

                {isTransfer ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                      marginTop: theme.spacing.xs,
                    }}
                  >
                    <Text variant="labelSm" numberOfLines={1}>
                      {account?.name ?? 'Account'}
                    </Text>
                    <Icon name="arrowRight" size={15} color={theme.colors.textTertiary} />
                    <Text variant="labelSm" numberOfLines={1}>
                      {destination?.name ?? 'Account'}
                    </Text>
                  </View>
                ) : null}

                {/* Said plainly, because it is the single rule people get wrong
                    about their own ledger. */}
                {isTransfer ? (
                  <Text variant="caption" tone="tertiary" align="center">
                    Counted as neither income nor spending.
                  </Text>
                ) : null}
              </View>
            </Card>

            <Card padding={0} radius="xl" style={{ marginTop: theme.spacing.lg }}>
              <View style={{ paddingHorizontal: theme.spacing.lg }}>
                {!isTransfer && category ? (
                  <>
                    <DetailRow
                      label="Category"
                      value={`${category.group} · ${category.name}`}
                      leading={
                        <IconTile
                          name={toIconName(category.icon)}
                          color={categoryColor(category.color)}
                          size="sm"
                        />
                      }
                    />
                    <Divider inset={36 + theme.spacing.md} />
                  </>
                ) : null}

                <DetailRow
                  label={isTransfer ? 'From' : 'Account'}
                  value={
                    account
                      ? `${account.name}${account.last4 ? ` ·· ${account.last4}` : ''}`
                      : 'Unknown'
                  }
                  leading={
                    account ? (
                      <IconTile name={toIconName(account.icon)} color={account.color} size="sm" />
                    ) : undefined
                  }
                />

                {isTransfer && destination ? (
                  <>
                    <Divider inset={36 + theme.spacing.md} />
                    <DetailRow
                      label="To"
                      value={`${destination.name}${destination.last4 ? ` ·· ${destination.last4}` : ''}`}
                      leading={
                        <IconTile
                          name={toIconName(destination.icon)}
                          color={destination.color}
                          size="sm"
                        />
                      }
                    />
                  </>
                ) : null}

                <Divider inset={36 + theme.spacing.md} />
                <DetailRow
                  label="Date"
                  value={`${formatDayLabel(transaction.date)} · ${formatTime(transaction.date)}`}
                  leading={
                    <IconTile name="calendar" color={theme.colors.textTertiary} size="sm" />
                  }
                />

                <Divider inset={36 + theme.spacing.md} />
                <DetailRow
                  label="Paid with"
                  value={PAYMENT_METHOD_LABEL[transaction.paymentMethod]}
                  leading={<IconTile name="card" color={theme.colors.textTertiary} size="sm" />}
                />

                {transaction.description ? (
                  <>
                    <Divider inset={36 + theme.spacing.md} />
                    <DetailRow
                      label="Note"
                      value={transaction.description}
                      leading={<IconTile name="list" color={theme.colors.textTertiary} size="sm" />}
                      multiline
                    />
                  </>
                ) : null}
              </View>
            </Card>

            <ReceiptCard
              receipt={receipt}
              loading={receiptsQuery.isLoading}
              available={receiptStatus.data?.storage ?? false}
              busy={uploadReceipt.isPending || removeReceipt.isPending}
              onAttach={() => void attachReceipt()}
              onRemove={confirmRemoveReceipt}
            />

            {deleteError ? (
              <View
                accessibilityLiveRegion="assertive"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  marginTop: theme.spacing.lg,
                  padding: theme.spacing.md,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.negativeSurface,
                }}
              >
                <Icon name="alertCircle" size={17} color={theme.colors.negative} />
                <Text variant="caption" tone="negative" style={{ flex: 1 }}>
                  {deleteError}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
              <Button
                label="Edit"
                leftIcon="settings"
                variant="secondary"
                size="lg"
                onPress={() => openEditSheet(transaction)}
                style={{ flex: 1 }}
              />
              <Button
                label="Delete"
                variant="destructive"
                size="lg"
                loading={remove.isPending}
                onPress={confirmDelete}
                style={{ flex: 1 }}
              />
            </View>

            <Text
              variant="caption"
              tone="tertiary"
              align="center"
              style={{ marginTop: theme.spacing.xl }}
            >
              {`Recorded ${formatDayLabel(transaction.createdAt)} at ${formatTime(transaction.createdAt)}`}
            </Text>
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
  leading?: React.ReactNode;
  multiline?: boolean;
};

function DetailRow({ label, value, leading, multiline = false }: DetailRowProps) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={{
        flexDirection: 'row',
        alignItems: multiline ? 'flex-start' : 'center',
        gap: theme.spacing.md,
        minHeight: 60,
        paddingVertical: theme.spacing.md,
      }}
    >
      {leading}
      <Text variant="bodySm" tone="secondary" style={{ flex: 1, minWidth: 0 }}>
        {label}
      </Text>
      <Text
        variant="labelSm"
        numberOfLines={multiline ? 4 : 1}
        style={{ flex: multiline ? 1.6 : undefined, textAlign: 'right' }}
      >
        {value}
      </Text>
    </View>
  );
}
