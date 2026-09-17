import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  useAccounts,
  useCategories,
  type Account,
  type Category,
  type ObligationDirection,
  type ObligationType,
} from '@/api';
import {
  BottomSheet,
  Button,
  Icon,
  IconButton,
  Input,
  Keypad,
  SegmentedControl,
  Text,
  type SegmentOption,
} from '@/components/ui';
import { AccountPicker, CategoryPicker } from '@/screens/sheets/pickers';
import { useTheme } from '@/theme';
import {
  RUPEE,
  applyAmountKey,
  formatAmountInput,
  rupeesToPaise,
} from '@/utils/currency';
import { errorFeedback, successFeedback } from '@/utils/haptics';

export type AddMoneyOwedSheetProps = {
  visible: boolean;
  onClose: () => void;
  personId: string;
  personName: string;
  onSave: (input: {
    personId: string;
    direction: ObligationDirection;
    type: ObligationType;
    amount: number;
    purpose: string;
    accountId: string;
    categoryId?: string | null;
    note?: string;
  }) => Promise<void>;
};

const DIRECTION_OPTIONS: readonly SegmentOption<ObligationDirection>[] = [
  { value: 'owed_to_me', label: 'Someone owes me' },
  { value: 'i_owe', label: 'I owe someone' },
];

const TYPE_OPTIONS: readonly SegmentOption<ObligationType>[] = [
  { value: 'loan', label: 'Loan' },
  { value: 'paid_for', label: 'Paid for them' },
];

export function AddMoneyOwedSheet({
  visible,
  onClose,
  personId,
  personName,
  onSave,
}: AddMoneyOwedSheetProps) {
  const theme = useTheme();

  const accountsQuery = useAccounts();
  const categoriesQuery = useCategories('expense');

  const accounts = useMemo(
    () => accountsQuery.data?.filter((a) => a.isActive) ?? [],
    [accountsQuery.data],
  );
  const categories = useMemo(
    () => (categoriesQuery.data?.categories ?? []).filter((c: Category) => c.isActive),
    [categoriesQuery.data],
  );

  const [step, setStep] = useState<'form' | 'account' | 'category'>('form');
  const [direction, setDirection] = useState<ObligationDirection>('owed_to_me');
  const [type, setType] = useState<ObligationType>('loan');
  const [amountInput, setAmountInput] = useState('');
  const [purpose, setPurpose] = useState('');
  const [note] = useState('');

  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => accounts[0]?.id ?? '');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) ?? accounts[0],
    [accounts, selectedAccountId],
  );

  const selectedCategory = useMemo(
    () => categories.find((c: Category) => c.id === selectedCategoryId),
    [categories, selectedCategoryId],
  );

  const amountPaise = rupeesToPaise(amountInput);

  function handleKeypad(key: string) {
    setAmountInput((current) => applyAmountKey(current, key));
    setErrorMessage(null);
  }

  async function handleSubmit() {
    if (amountPaise <= 0) {
      errorFeedback();
      setErrorMessage('Enter an amount');
      return;
    }
    if (!purpose.trim()) {
      errorFeedback();
      setErrorMessage('Enter purpose (e.g. Loan, Amazon purchase)');
      return;
    }
    if (!selectedAccount) {
      errorFeedback();
      setErrorMessage('Select an account');
      return;
    }

    try {
      setSubmitting(true);
      await onSave({
        personId,
        direction,
        type: direction === 'i_owe' ? 'borrowed' : type,
        amount: amountPaise,
        purpose: purpose.trim(),
        accountId: selectedAccount.id,
        categoryId: selectedCategoryId,
        note: note.trim() || undefined,
      });
      successFeedback();
      onClose();
    } catch (err: unknown) {
      errorFeedback();
      setErrorMessage(err instanceof Error ? err.message : 'Could not save obligation');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'account') {
    return (
      <BottomSheet visible={visible} onClose={() => setStep('form')} title="Select Account">
        <AccountPicker
          accounts={accounts}
          selectedId={selectedAccount?.id}
          onSelect={(account: Account) => {
            setSelectedAccountId(account.id);
            setStep('form');
          }}
        />
        <View style={{ height: theme.spacing.xl }} />
      </BottomSheet>
    );
  }

  if (step === 'category') {
    return (
      <BottomSheet visible={visible} onClose={() => setStep('form')} title="Select Category">
        <CategoryPicker
          categories={categories}
          selectedId={selectedCategoryId ?? undefined}
          onSelect={(cat: Category) => {
            setSelectedCategoryId(cat.id);
            setStep('form');
          }}
        />
        <View style={{ height: theme.spacing.xl }} />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingBottom: theme.spacing.lg }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: theme.spacing.md,
          }}
        >
          <View>
            <Text variant="h3">
              Add Money Owed
            </Text>
            <Text variant="caption" tone="secondary">
              Involving {personName}
            </Text>
          </View>
          <IconButton name="close" size="sm" accessibilityLabel="Close" onPress={onClose} />
        </View>

        {/* Direction Segmented Control */}
        <View style={{ marginBottom: theme.spacing.md }}>
          <SegmentedControl
            options={DIRECTION_OPTIONS}
            value={direction}
            onChange={(val) => {
              setDirection(val);
              if (val === 'i_owe') setType('borrowed');
              else if (type === 'borrowed') setType('loan');
            }}
          />
        </View>

        {/* Sub-type if someone owes me */}
        {direction === 'owed_to_me' ? (
          <View style={{ marginBottom: theme.spacing.md }}>
            <SegmentedControl
              options={TYPE_OPTIONS}
              value={type}
              onChange={(val) => setType(val)}
            />
          </View>
        ) : null}

        {/* Amount Box */}
        <View
          style={{
            alignItems: 'center',
            paddingVertical: theme.spacing.lg,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.xl,
            marginBottom: theme.spacing.md,
          }}
        >
          <Text variant="caption" tone="tertiary" style={{ marginBottom: theme.spacing.xs }}>
            {direction === 'owed_to_me' ? 'AMOUNT LENT / PAID' : 'AMOUNT BORROWED'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text variant="h2" tone="secondary">
              {RUPEE}{' '}
            </Text>
            <Text variant="h1">
              {formatAmountInput(amountInput)}
            </Text>
          </View>
        </View>

        {/* Purpose Input */}
        <View style={{ marginBottom: theme.spacing.md }}>
          <Input
            value={purpose}
            onChangeText={setPurpose}
            placeholder={
              type === 'paid_for'
                ? 'What was it? (e.g. Amazon purchase, Dinner)'
                : 'Purpose (e.g. Loan, Rent, Travel)'
            }
          />
        </View>

        {/* Category Picker (if paid for someone) */}
        {type === 'paid_for' ? (
          <Pressable
            onPress={() => setStep('category')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: theme.spacing.md,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              marginBottom: theme.spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Icon name="list" size={18} color={theme.colors.textSecondary} />
              <Text variant="label">
                Category: {selectedCategory?.name ?? 'Optional (e.g. Shopping)'}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={theme.colors.textTertiary} />
          </Pressable>
        ) : null}

        {/* Account Selector */}
        <Pressable
          onPress={() => setStep('account')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.spacing.md,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.lg,
            marginBottom: theme.spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="wallet" size={18} color={theme.colors.brand} />
            <Text variant="label">
              {direction === 'owed_to_me' ? 'Paid from:' : 'Received into:'}{' '}
              {selectedAccount?.name ?? 'Select Account'}
            </Text>
          </View>
          <Icon name="chevronRight" size={18} color={theme.colors.textTertiary} />
        </Pressable>

        {/* Error message */}
        {errorMessage ? (
          <Text variant="caption" style={{ color: '#EF4444', marginBottom: theme.spacing.sm }}>
            {errorMessage}
          </Text>
        ) : null}

        {/* Keypad */}
        <Keypad onKey={handleKeypad} />

        {/* Submit */}
        <View style={{ marginTop: theme.spacing.lg }}>
          <Button
            label={submitting ? 'Saving...' : 'Save'}
            variant="primary"
            size="lg"
            onPress={handleSubmit}
            disabled={submitting}
          />
        </View>
      </View>
    </BottomSheet>
  );
}
