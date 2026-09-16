import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  BottomSheet,
  Button,
  Card,
  Icon,
  IconTile,
  Input,
  SegmentedControl,
  Text,
  type SegmentOption,
} from '@/components/ui';
import { accounts, categories, getCategory } from '@/data/mock';
import { useUiStore } from '@/store/uiStore';
import { categoryColor, useTheme } from '@/theme';
import type { TransactionKind } from '@/types/models';
import { RUPEE, rupeesToPaise } from '@/utils/currency';
import { successFeedback, tapFeedback } from '@/utils/haptics';

const KIND_OPTIONS: readonly SegmentOption<TransactionKind>[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

const DEFAULT_CATEGORY = 'grocery';

/**
 * New-transaction sheet, opened from the tab bar's add button.
 *
 * Step 1 has no persistence layer, so submitting validates the input and closes.
 * The form state, validation and reset behaviour are real — only the write is
 * missing, and it slots into `handleSubmit`.
 */
export function AddTransactionSheet() {
  const theme = useTheme();
  const open = useUiStore((state) => state.addSheetOpen);
  const close = useUiStore((state) => state.closeAddSheet);

  const [kind, setKind] = useState<TransactionKind>('expense');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY);
  const [error, setError] = useState<string | undefined>();

  const category = getCategory(categoryId);
  const account = accounts[0];

  const reset = useCallback(() => {
    setKind('expense');
    setAmount('');
    setMerchant('');
    setCategoryId(DEFAULT_CATEGORY);
    setError(undefined);
  }, []);

  const handleClose = useCallback(() => {
    close();
    // Clear after the exit animation so the form does not visibly empty itself.
    setTimeout(reset, 250);
  }, [close, reset]);

  function handleSubmit() {
    const paise = rupeesToPaise(amount);
    if (paise <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }

    // TODO(step-2): write through the transaction store once persistence exists.
    successFeedback();
    handleClose();
  }

  // Cycles the category chip so the picker row demonstrates a real interaction
  // without a full picker screen existing yet.
  function cycleCategory() {
    const index = categories.findIndex((entry) => entry.id === categoryId);
    const next = categories[(index + 1) % categories.length];
    if (next) setCategoryId(next.id);
  }

  const actionLabel =
    kind === 'expense' ? 'Add expense' : kind === 'income' ? 'Add income' : 'Add transfer';

  return (
    <BottomSheet
      visible={open}
      onClose={handleClose}
      title="New transaction"
      subtitle="Nothing is saved yet — this is the entry flow"
      footer={
        <Button label={actionLabel} onPress={handleSubmit} variant="brand" size="lg" fullWidth />
      }
    >
      <SegmentedControl
        options={KIND_OPTIONS}
        value={kind}
        onChange={setKind}
        accessibilityLabel="Transaction type"
      />

      <Input
        label="Amount"
        size="amount"
        prefix={RUPEE}
        placeholder="0"
        value={amount}
        onChangeText={(next) => {
          setAmount(next);
          if (error) setError(undefined);
        }}
        error={error}
        keyboardType="decimal-pad"
        returnKeyType="next"
        containerStyle={{ marginTop: theme.spacing.xl }}
      />

      <Input
        label={kind === 'income' ? 'Source' : 'Paid to'}
        placeholder={kind === 'income' ? 'Salary, freelance…' : 'Blinkit, Swiggy, Indian Oil…'}
        value={merchant}
        onChangeText={setMerchant}
        leftIcon="search"
        returnKeyType="done"
        containerStyle={{ marginTop: theme.spacing.lg }}
      />

      <Text variant="labelSm" tone="secondary" style={{ marginTop: theme.spacing.xl, marginBottom: 8 }}>
        Details
      </Text>

      <Card variant="outlined" padding={0} radius="md">
        <PickerRow
          label="Category"
          value={category.label}
          leading={
            <IconTile
              name={category.icon}
              color={categoryColor(category.hue)}
              size="sm"
            />
          }
          onPress={cycleCategory}
        />
        <View style={{ height: 1, backgroundColor: theme.colors.border }} />
        <PickerRow
          label="Account"
          value={account ? `${account.name}${account.last4 ? ` ·· ${account.last4}` : ''}` : '—'}
          leading={
            account ? (
              <IconTile name={account.icon} color={theme.colors.textTertiary} size="sm" />
            ) : null
          }
        />
      </Card>

      <View style={{ height: theme.spacing.sm }} />
    </BottomSheet>
  );
}

type PickerRowProps = {
  label: string;
  value: string;
  leading?: React.ReactNode;
  onPress?: () => void;
};

function PickerRow({ label, value, leading, onPress }: PickerRowProps) {
  const theme = useTheme();

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        minHeight: 56,
      }}
    >
      {leading}
      <Text variant="bodySm" tone="secondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="labelSm" numberOfLines={1}>
        {value}
      </Text>
      {onPress ? (
        <Icon name="chevronRight" size={16} color={theme.colors.textTertiary} />
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${label}, ${value}`}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityHint="Changes the selected category"
    >
      {body}
    </Pressable>
  );
}
