import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  errorMessage,
  useAccounts,
  useCategories,
  useCreateTransaction,
  useUpdateTransaction,
  type Account,
  type Category,
  type CreateTransactionInput,
  type PaymentMethod,
  type TransactionType,
} from '@/api';
import { PAYMENT_METHOD_LABEL } from '@/api/types';
import { toIconName } from '@/components/icons/registry';
import {
  BottomSheet,
  Button,
  Icon,
  IconTile,
  Input,
  Keypad,
  LoadingState,
  SegmentedControl,
  Text,
  type SegmentOption,
} from '@/components/ui';
import { AccountPicker, CategoryPicker, DatePicker, MethodPicker } from '@/screens/sheets/pickers';
import { useUiStore } from '@/store/uiStore';
import { categoryColor, useTheme } from '@/theme';
import {
  RUPEE,
  applyAmountKey,
  formatAmountInput,
  paiseToRupeeInput,
  rupeesToPaise,
} from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';
import { errorFeedback, successFeedback, tapFeedback } from '@/utils/haptics';

const KIND_OPTIONS: readonly SegmentOption<TransactionType>[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

/** Which panel the sheet is showing. `form` is the amount pad. */
type Step = 'form' | 'category' | 'account' | 'destination' | 'method' | 'date';

const STEP_TITLE: Record<Exclude<Step, 'form'>, string> = {
  category: 'Choose a category',
  account: 'Pay from',
  destination: 'Transfer to',
  method: 'How did you pay?',
  date: 'When was this?',
};

/**
 * The add / edit transaction sheet.
 *
 * The whole design serves one number: how many gestures it takes to record a
 * ₹40 chai. Open, type, save — three, because the amount pad is already on screen
 * and the category, account and method default to whatever was used last. The
 * pickers are one tap away for the times it is something else, and everything
 * optional (merchant, note, date) is a row you can ignore forever.
 *
 * Pickers swap the sheet's body rather than opening a second sheet; see the note
 * in `pickers.tsx` for why.
 */
export function AddTransactionSheet() {
  const theme = useTheme();
  const sheet = useUiStore((state) => state.entrySheet);
  const close = useUiStore((state) => state.closeEntrySheet);
  const lastUsed = useUiStore((state) => state.lastUsed);
  const rememberChoice = useUiStore((state) => state.rememberChoice);

  const editing = sheet.mode === 'edit' ? sheet.transaction : null;
  const open = sheet.mode !== 'closed';

  const [step, setStep] = useState<Step>('form');
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>();
  const [destinationId, setDestinationId] = useState<string | undefined>();
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [date, setDate] = useState(() => new Date());
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const accountsQuery = useAccounts();
  const categoriesQuery = useCategories(type === 'transfer' ? undefined : type);

  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const saving = createMutation.isPending || updateMutation.isPending;

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const categories = useMemo(
    () => (categoriesQuery.data?.categories ?? []).filter((entry) => entry.type === type),
    [categoriesQuery.data, type],
  );

  const account = accounts.find((entry) => entry.id === accountId);
  const destination = accounts.find((entry) => entry.id === destinationId);
  const category = categories.find((entry) => entry.id === categoryId);

  /**
   * Fills the form when the sheet opens.
   *
   * Two different jobs: an edit loads the transaction, and a create loads the
   * defaults. Keyed on `open` so reopening always starts clean rather than
   * inheriting whatever half-typed amount was abandoned last time.
   */
  useEffect(() => {
    if (!open) return;

    if (sheet.mode === 'edit') {
      const transaction = sheet.transaction;
      setType(transaction.type);
      setAmount(paiseToRupeeInput(transaction.amount));
      setCategoryId(transaction.categoryId ?? undefined);
      setAccountId(transaction.accountId);
      setDestinationId(transaction.destinationAccountId ?? undefined);
      setMethod(transaction.paymentMethod);
      setDate(new Date(transaction.date));
      setMerchant(transaction.merchant);
      setNote(transaction.description);
      setShowDetails(Boolean(transaction.merchant || transaction.description));
    } else {
      setType(sheet.type);
      setAmount('');
      setMerchant('');
      setNote('');
      setShowDetails(false);
      setDate(new Date());
    }

    setStep('form');
    setError(undefined);
  }, [open, sheet]);

  // Defaults land once the data is in, and never overwrite an explicit choice.
  useEffect(() => {
    if (!open || sheet.mode === 'edit') return;

    const remembered = lastUsed[type];

    setAccountId((current) => {
      if (current && accounts.some((entry) => entry.id === current)) return current;
      const preferred = accounts.find((entry) => entry.id === remembered?.accountId);
      return preferred?.id ?? accounts[0]?.id;
    });

    if (type === 'transfer') {
      setDestinationId((current) => {
        if (current && accounts.some((entry) => entry.id === current)) return current;
        const preferred = accounts.find((entry) => entry.id === remembered?.destinationAccountId);
        return preferred?.id ?? accounts[1]?.id;
      });
      setCategoryId(undefined);
    } else {
      setCategoryId((current) => {
        if (current && categories.some((entry) => entry.id === current)) return current;
        const preferred = categories.find((entry) => entry.id === remembered?.categoryId);
        return preferred?.id ?? categories[0]?.id;
      });
    }

    if (remembered?.paymentMethod) setMethod(remembered.paymentMethod);
  }, [open, sheet.mode, type, accounts, categories, lastUsed]);

  const handleClose = useCallback(() => {
    close();
    createMutation.reset();
    updateMutation.reset();
  }, [close, createMutation, updateMutation]);

  function handleKey(key: string) {
    setAmount((current) => applyAmountKey(current, key));
    if (error) setError(undefined);
  }

  function handleTypeChange(next: TransactionType) {
    setType(next);
    // A category belongs to one side of the ledger, so it cannot survive the
    // switch. Clearing it lets the defaults effect pick the right one.
    setCategoryId(undefined);
    setError(undefined);
  }

  const paise = rupeesToPaise(amount);

  async function handleSubmit() {
    if (paise <= 0) {
      setError('Enter an amount greater than zero');
      errorFeedback();
      return;
    }
    if (!accountId) {
      setError('Pick an account');
      errorFeedback();
      return;
    }
    if (type === 'transfer' && !destinationId) {
      setError('Pick an account to transfer into');
      errorFeedback();
      return;
    }
    if (type === 'transfer' && destinationId === accountId) {
      setError('Transfer between two different accounts');
      errorFeedback();
      return;
    }
    if (type !== 'transfer' && !categoryId) {
      setError('Pick a category');
      errorFeedback();
      return;
    }

    const base = {
      amount: paise,
      accountId,
      merchant: merchant.trim(),
      description: note.trim(),
      paymentMethod: method,
      date: date.toISOString(),
    };

    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          patch:
            type === 'transfer'
              ? { ...base, destinationAccountId: destinationId }
              : { ...base, categoryId },
        });
      } else {
        const input: CreateTransactionInput =
          type === 'transfer'
            ? { type, ...base, destinationAccountId: destinationId as string }
            : { type, ...base, categoryId: categoryId as string };
        await createMutation.mutateAsync(input);
      }

      rememberChoice(type, {
        accountId,
        destinationAccountId: destinationId,
        categoryId,
        paymentMethod: method,
      });
      successFeedback();
      handleClose();
    } catch (cause) {
      errorFeedback();
      setError(errorMessage(cause));
    }
  }

  const actionLabel = editing
    ? 'Save changes'
    : type === 'expense'
      ? 'Add expense'
      : type === 'income'
        ? 'Add income'
        : 'Transfer money';

  const loadingReferences = accountsQuery.isLoading || categoriesQuery.isLoading;

  if (step !== 'form') {
    return (
      <BottomSheet
        visible={open}
        onClose={() => setStep('form')}
        title={STEP_TITLE[step]}
        subtitle={`${RUPEE}${formatAmountInput(amount)}`}
        maxHeightRatio={0.88}
      >
        <PickerPanel
          step={step}
          accounts={accounts}
          categories={categories}
          categoryId={categoryId}
          accountId={accountId}
          destinationId={destinationId}
          method={method}
          date={date}
          onPickCategory={(picked: Category) => {
            setCategoryId(picked.id);
            setStep('form');
          }}
          onPickAccount={(picked: Account) => {
            if (step === 'destination') setDestinationId(picked.id);
            else setAccountId(picked.id);
            setStep('form');
          }}
          onPickMethod={(picked) => {
            setMethod(picked);
            setStep('form');
          }}
          onPickDate={(picked) => {
            setDate(picked);
            setStep('form');
          }}
        />
        <View style={{ height: theme.spacing.xl }} />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      visible={open}
      onClose={handleClose}
      title={editing ? 'Edit transaction' : 'New transaction'}
      maxHeightRatio={0.94}
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          {error ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radius.sm,
                backgroundColor: theme.colors.negativeSurface,
              }}
            >
              <Icon name="alertCircle" size={16} color={theme.colors.negative} />
              <Text variant="caption" tone="negative" style={{ flex: 1 }}>
                {error}
              </Text>
            </View>
          ) : null}
          <Button
            label={actionLabel}
            onPress={handleSubmit}
            variant="brand"
            size="lg"
            fullWidth
            loading={saving}
            disabled={loadingReferences}
          />
        </View>
      }
    >
      {editing ? null : (
        <SegmentedControl
          options={KIND_OPTIONS}
          value={type}
          onChange={handleTypeChange}
          accessibilityLabel="Transaction type"
        />
      )}

      {/* The amount is the subject of this screen, so it gets display size and the
          whole width rather than sitting in a labelled field. */}
      <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
          <Text variant="h2" tone="tertiary" style={{ marginTop: 6 }} maxFontSizeMultiplier={1.2}>
            {RUPEE}
          </Text>
          <Text
            variant="displayLg"
            tone={amount === '' ? 'tertiary' : 'primary'}
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.15}
            accessibilityLabel={`Amount ${formatAmountInput(amount)} rupees`}
          >
            {formatAmountInput(amount)}
          </Text>
        </View>
      </View>

      {loadingReferences ? (
        <LoadingState label="Loading your accounts" fill={false} />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {type === 'transfer' ? (
              <>
                <Selector
                  flex
                  label="From"
                  value={account?.name ?? 'Pick'}
                  icon={toIconName(account?.icon)}
                  tint={account?.color}
                  onPress={() => setStep('account')}
                />
                <View style={{ justifyContent: 'center' }}>
                  <Icon name="arrowRight" size={16} color={theme.colors.textTertiary} />
                </View>
                <Selector
                  flex
                  label="To"
                  value={destination?.name ?? 'Pick'}
                  icon={toIconName(destination?.icon)}
                  tint={destination?.color}
                  onPress={() => setStep('destination')}
                />
              </>
            ) : (
              <>
                <Selector
                  flex
                  label="Category"
                  value={category?.name ?? 'Pick'}
                  icon={toIconName(category?.icon)}
                  tint={category ? categoryColor(category.color) : undefined}
                  onPress={() => setStep('category')}
                />
                <Selector
                  flex
                  label="Account"
                  value={account?.name ?? 'Pick'}
                  icon={toIconName(account?.icon)}
                  tint={account?.color}
                  onPress={() => setStep('account')}
                />
              </>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Selector
              flex
              label="Date"
              value={formatDayLabel(date.toISOString())}
              icon="calendar"
              onPress={() => setStep('date')}
            />
            <Selector
              flex
              label="Method"
              value={PAYMENT_METHOD_LABEL[method]}
              icon="card"
              onPress={() => setStep('method')}
            />
          </View>
        </View>
      )}

      {/* Everything below here is optional, and stays folded away until asked for.
          A note field in the fast path is a field most people scroll past. */}
      {showDetails ? (
        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
          <Input
            label={type === 'income' ? 'Source' : 'Paid to'}
            placeholder={type === 'income' ? 'Salary, freelance…' : 'Swiggy, Indian Oil…'}
            value={merchant}
            onChangeText={setMerchant}
            returnKeyType="next"
            maxLength={120}
          />
          <Input
            label="Note"
            placeholder="Optional"
            value={note}
            onChangeText={setNote}
            returnKeyType="done"
            maxLength={500}
          />
        </View>
      ) : (
        <Pressable
          onPress={() => {
            tapFeedback();
            setShowDetails(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add a merchant and note"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: theme.spacing.md,
            minHeight: 44,
          }}
        >
          <Icon name="plus" size={14} color={theme.colors.textTertiary} />
          <Text variant="labelSm" tone="tertiary">
            Add merchant or note
          </Text>
        </Pressable>
      )}

      <Keypad
        onKey={handleKey}
        onLongBackspace={() => setAmount('')}
        style={{ marginTop: theme.spacing.md }}
      />
    </BottomSheet>
  );
}

type SelectorProps = {
  label: string;
  value: string;
  icon: ReturnType<typeof toIconName>;
  tint?: string;
  flex?: boolean;
  onPress: () => void;
};

/** One tappable slot on the entry form: a tinted glyph, a label and the choice. */
function Selector({ label, value, icon, tint, flex, onPress }: SelectorProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityHint="Opens the picker"
      style={({ pressed }) => ({
        flex: flex ? 1 : undefined,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        minHeight: 56,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: pressed ? theme.colors.surfaceStrong : theme.colors.surfaceMuted,
      })}
    >
      <IconTile name={icon} color={tint ?? theme.colors.textTertiary} size="sm" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="labelSm" numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Icon name="chevronDown" size={14} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

type PickerPanelProps = {
  step: Exclude<Step, 'form'>;
  accounts: Account[];
  categories: Category[];
  categoryId?: string;
  accountId?: string;
  destinationId?: string;
  method: PaymentMethod;
  date: Date;
  onPickCategory: (category: Category) => void;
  onPickAccount: (account: Account) => void;
  onPickMethod: (method: PaymentMethod) => void;
  onPickDate: (date: Date) => void;
};

function PickerPanel(props: PickerPanelProps) {
  switch (props.step) {
    case 'category':
      return (
        <CategoryPicker
          categories={props.categories}
          selectedId={props.categoryId}
          onSelect={props.onPickCategory}
        />
      );
    case 'account':
      return (
        <AccountPicker
          accounts={props.accounts}
          selectedId={props.accountId}
          excludeId={props.destinationId}
          onSelect={props.onPickAccount}
        />
      );
    case 'destination':
      return (
        <AccountPicker
          accounts={props.accounts}
          selectedId={props.destinationId}
          excludeId={props.accountId}
          onSelect={props.onPickAccount}
        />
      );
    case 'method':
      return <MethodPicker selected={props.method} onSelect={props.onPickMethod} />;
    case 'date':
      return <DatePicker value={props.date} onSelect={props.onPickDate} />;
  }
}
