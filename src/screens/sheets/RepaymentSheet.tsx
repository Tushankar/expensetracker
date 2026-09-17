import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAccounts, type Account } from '@/api';
import {
  BottomSheet,
  Button,
  Icon,
  IconButton,
  Input,
  Keypad,
  Text,
} from '@/components/ui';
import { AccountPicker } from '@/screens/sheets/pickers';
import { useTheme } from '@/theme';
import {
  RUPEE,
  applyAmountKey,
  formatAmountInput,
  formatINR,
  paiseToRupeeInput,
  rupeesToPaise,
} from '@/utils/currency';
import { errorFeedback, successFeedback } from '@/utils/haptics';

export type RepaymentSheetProps = {
  visible: boolean;
  onClose: () => void;
  personName: string;
  obligationId: string;
  remainingAmount: number;
  direction: 'owed_to_me' | 'i_owe';
  onRecord: (input: { amount: number; accountId: string; date?: string; note?: string }) => Promise<void>;
};

export function RepaymentSheet({
  visible,
  onClose,
  personName,
  remainingAmount,
  direction,
  onRecord,
}: RepaymentSheetProps) {
  const theme = useTheme();
  const accountsQuery = useAccounts();
  const accounts = useMemo(() => accountsQuery.data?.filter((a) => a.isActive) ?? [], [accountsQuery.data]);

  const [step, setStep] = useState<'form' | 'account'>('form');
  const [amountInput, setAmountInput] = useState(() => paiseToRupeeInput(remainingAmount));
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => accounts[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const amountPaise = rupeesToPaise(amountInput);
  const isOwedToMe = direction === 'owed_to_me';

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) ?? accounts[0],
    [accounts, selectedAccountId],
  );

  function handleKeypad(key: string) {
    setAmountInput((current) => applyAmountKey(current, key));
    setErrorMessage(null);
  }

  async function handleSubmit() {
    if (amountPaise <= 0) {
      errorFeedback();
      setErrorMessage('Enter a valid amount');
      return;
    }
    if (amountPaise > remainingAmount) {
      errorFeedback();
      setErrorMessage(
        `Amount cannot exceed remaining balance of ${formatINR(remainingAmount)}`,
      );
      return;
    }
    if (!selectedAccount) {
      errorFeedback();
      setErrorMessage('Select an account');
      return;
    }

    try {
      setSubmitting(true);
      await onRecord({
        amount: amountPaise,
        accountId: selectedAccount.id,
        note: note.trim() || undefined,
      });
      successFeedback();
      onClose();
    } catch (err: unknown) {
      errorFeedback();
      setErrorMessage(err instanceof Error ? err.message : 'Could not record repayment');
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
              Record Repayment
            </Text>
            <Text variant="caption" tone="secondary">
              {isOwedToMe ? `From ${personName}` : `To ${personName}`} (Remaining:{' '}
              {formatINR(remainingAmount)})
            </Text>
          </View>
          <IconButton name="close" size="sm" accessibilityLabel="Close" onPress={onClose} />
        </View>

        {/* Amount Display */}
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
            {isOwedToMe ? 'AMOUNT RECEIVED' : 'AMOUNT PAID'}
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

        {/* Account Selector Pill */}
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
              {isOwedToMe ? 'Received in:' : 'Paid from:'} {selectedAccount?.name ?? 'Select Account'}
            </Text>
          </View>
          <Icon name="chevronRight" size={18} color={theme.colors.textTertiary} />
        </Pressable>

        {/* Note Input */}
        <View style={{ marginBottom: theme.spacing.md }}>
          <Input
            value={note}
            onChangeText={setNote}
            placeholder="Optional note (e.g. GPay / cash)"
          />
        </View>

        {/* Error message */}
        {errorMessage ? (
          <Text variant="caption" style={{ color: '#EF4444', marginBottom: theme.spacing.sm }}>
            {errorMessage}
          </Text>
        ) : null}

        {/* Quick fill full amount */}
        {amountPaise !== remainingAmount ? (
          <Button
            label={`Pay Full ${formatINR(remainingAmount)}`}
            variant="ghost"
            size="sm"
            onPress={() => setAmountInput(paiseToRupeeInput(remainingAmount))}
            style={{ marginBottom: theme.spacing.md }}
          />
        ) : null}

        {/* Keypad */}
        <Keypad onKey={handleKeypad} />

        {/* Submit */}
        <View style={{ marginTop: theme.spacing.lg }}>
          <Button
            label={submitting ? 'Saving...' : 'Save Repayment'}
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
