import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_ICON,
  ACCOUNT_TYPE_LABEL,
  errorMessage,
  isApiError,
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
  type Account,
  type AccountType,
} from '@/api';
import { QueryState } from '@/components/data/QueryState';
import { toIconName } from '@/components/icons/registry';
import { Button, Card, Icon, IconTile, Input, Screen, Text } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { RUPEE, formatINR, rupeesToPaise } from '@/utils/currency';
import { errorFeedback, successFeedback, tapFeedback } from '@/utils/haptics';

/** Deliberately few. A colour picker with 24 swatches is a decision nobody wants. */
const COLOURS = ['#7856F0', '#4C8DFF', '#2BD98C', '#FFB020', '#FF6FB5', '#FF5F6D', '#2DD4BF', '#C77DFF'];

/**
 * Create or edit an account.
 *
 * The screen waits for the account list before mounting the form, then keys the
 * form on the account id. That is what lets every field be seeded with a plain
 * `useState` initialiser rather than an effect that copies the loaded account
 * into state once it arrives.
 */
export function AccountFormScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'AccountForm'>>();
  const accountId = route.params?.id;
  const editing = Boolean(accountId);

  const accountsQuery = useAccounts(true);
  const existing = accountsQuery.data?.find((account) => account.id === accountId);

  useLayoutEffect(() => {
    navigation.setOptions({ title: editing ? 'Edit account' : 'New account' });
  }, [navigation, editing]);

  return (
    <Screen topInset={false} bottomInset={theme.spacing.xxl} testID="account-form">
      <QueryState
        isLoading={editing && accountsQuery.isLoading}
        error={accountsQuery.error}
        isEmpty={editing && !accountsQuery.isLoading && !existing}
        onRetry={() => void accountsQuery.refetch()}
        loadingLabel="Loading the account"
        empty={{
          icon: 'wallet',
          title: 'Account not found',
          description: 'It may have been deleted on another device.',
        }}
      >
        <AccountForm key={existing?.id ?? 'new'} existing={existing} />
      </QueryState>
    </Screen>
  );
}

/**
 * The opening balance can only be set at creation. After that the balance is the
 * sum of what the ledger says, and a field that lets someone type over it is a
 * field that lets the balance and the transactions disagree — with no way to
 * tell which one is wrong.
 */
function AccountForm({ existing }: { existing?: Account }) {
  const theme = useTheme();
  const navigation = useNavigation();
  const editing = Boolean(existing);
  const accountId = existing?.id;

  const create = useCreateAccount();
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const busy = create.isPending || update.isPending || remove.isPending;

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AccountType>(existing?.type ?? 'bank');
  const [institution, setInstitution] = useState(existing?.institution ?? '');
  const [last4, setLast4] = useState(existing?.last4 ?? '');
  const [openingBalance, setOpeningBalance] = useState('');
  const [color, setColor] = useState(existing?.color ?? (COLOURS[0] as string));
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSave() {
    setError(undefined);
    setFieldErrors({});

    if (name.trim().length === 0) {
      setFieldErrors({ name: 'Give the account a name' });
      errorFeedback();
      return;
    }
    if (last4 && !/^\d{4}$/.test(last4)) {
      setFieldErrors({ last4: 'Four digits, or leave it blank' });
      errorFeedback();
      return;
    }

    const payload = {
      name: name.trim(),
      type,
      icon: ACCOUNT_TYPE_ICON[type],
      color,
      ...(institution.trim() ? { institution: institution.trim() } : {}),
      ...(last4 ? { last4 } : {}),
    };

    try {
      if (editing && accountId) {
        await update.mutateAsync({
          id: accountId,
          // Sending empty strings clears the optional fields, which is what
          // deleting the text in them should mean.
          patch: {
            ...payload,
            institution: institution.trim() || undefined,
            last4: last4 || undefined,
          },
        });
      } else {
        await create.mutateAsync({ ...payload, balance: rupeesToPaise(openingBalance) });
      }
      successFeedback();
      navigation.goBack();
    } catch (cause) {
      errorFeedback();
      if (isApiError(cause) && cause.issues.length > 0) {
        const mapped: Record<string, string> = {};
        for (const issue of cause.issues) mapped[issue.field] = issue.message;
        setFieldErrors(mapped);
        return;
      }
      setError(errorMessage(cause));
    }
  }

  function confirmDelete() {
    if (!accountId) return;

    Alert.alert(
      'Delete this account?',
      'If it has transactions it will be archived instead, so your history stays intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            remove.mutate(accountId, {
              onSuccess() {
                successFeedback();
                navigation.goBack();
              },
              onError(cause) {
                errorFeedback();
                setError(errorMessage(cause));
              },
            });
          },
        },
      ],
    );
  }

  return (
    <>
      <View style={{ gap: theme.spacing.lg, marginTop: theme.spacing.sm }}>
        <Input
          label="Name"
          placeholder="HDFC Savings"
          value={name}
          onChangeText={setName}
          error={fieldErrors.name}
          autoCapitalize="words"
          returnKeyType="next"
          maxLength={60}
          editable={!busy}
        />

        <View>
          <Text variant="labelSm" tone="secondary" style={{ marginBottom: theme.spacing.sm }}>
            Type
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.lg }}
          >
            {ACCOUNT_TYPES.map((option) => {
              const active = option === type;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    tapFeedback();
                    setType(option);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={ACCOUNT_TYPE_LABEL[option]}
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    height: 44,
                    paddingHorizontal: theme.spacing.md,
                    borderRadius: theme.radius.md,
                    backgroundColor: active ? theme.colors.brandSurface : theme.colors.surface,
                    borderWidth: theme.layout.hairline,
                    borderColor: active ? theme.colors.brand : theme.colors.border,
                  }}
                >
                  <Icon
                    name={toIconName(ACCOUNT_TYPE_ICON[option])}
                    size={16}
                    color={active ? theme.colors.brandText : theme.colors.textTertiary}
                  />
                  <Text
                    variant="labelSm"
                    color={active ? theme.colors.brandText : theme.colors.textSecondary}
                  >
                    {ACCOUNT_TYPE_LABEL[option]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <Input
            label="Bank or issuer"
            placeholder="Optional"
            value={institution}
            onChangeText={setInstitution}
            containerStyle={{ flex: 1.6 }}
            maxLength={60}
            editable={!busy}
          />
          <Input
            label="Last 4"
            placeholder="4821"
            value={last4}
            onChangeText={(next) => setLast4(next.replace(/\D/g, '').slice(0, 4))}
            error={fieldErrors.last4}
            keyboardType="number-pad"
            maxLength={4}
            containerStyle={{ flex: 1 }}
            editable={!busy}
          />
        </View>

        {editing ? (
          <Card variant="muted" radius="md" padding="lg">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <IconTile name={toIconName(existing?.icon)} color={color} size="sm" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption" tone="tertiary">
                  Current balance
                </Text>
                <Text
                  variant="labelSm"
                  tone={(existing?.balance ?? 0) < 0 ? 'negative' : 'primary'}
                  numberOfLines={1}
                >
                  {formatINR(existing?.balance ?? 0)}
                </Text>
              </View>
            </View>
            <Text variant="caption" tone="tertiary" style={{ marginTop: theme.spacing.sm }}>
              The balance follows your transactions. Add or edit one to change it.
            </Text>
          </Card>
        ) : (
          <Input
            label="Opening balance"
            placeholder="0"
            prefix={RUPEE}
            value={openingBalance}
            onChangeText={setOpeningBalance}
            helperText="What is in the account today. Everything after this comes from transactions."
            keyboardType="decimal-pad"
            editable={!busy}
          />
        )}

        <View>
          <Text variant="labelSm" tone="secondary" style={{ marginBottom: theme.spacing.sm }}>
            Colour
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
            {COLOURS.map((option) => {
              const active = option === color;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    tapFeedback();
                    setColor(option);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Colour ${option}`}
                  accessibilityState={{ selected: active }}
                  hitSlop={8}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: option,
                    borderWidth: active ? 3 : 0,
                    borderColor: theme.colors.textPrimary,
                  }}
                >
                  {active ? <Icon name="check" size={18} color="#FFFFFF" strokeWidth={2.6} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {error ? (
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
            {error}
          </Text>
        </View>
      ) : null}

      <Button
        label={editing ? 'Save changes' : 'Create account'}
        onPress={() => void handleSave()}
        variant="brand"
        size="lg"
        fullWidth
        loading={create.isPending || update.isPending}
        style={{ marginTop: theme.spacing.xxl }}
      />

      {editing ? (
        <Button
          label="Delete account"
          onPress={confirmDelete}
          variant="ghost"
          size="md"
          loading={remove.isPending}
          style={{ alignSelf: 'center', marginTop: theme.spacing.lg }}
        />
      ) : null}
    </>
  );
}
