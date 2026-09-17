import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  errorMessage,
  useAccounts,
  useCategories,
  useCreateTransaction,
  useSuggestCategory,
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
  Badge,
  BottomSheet,
  Button,
  Icon,
  IconTile,
  Input,
  Keypad,
  LoadingState,
  SegmentedControl,
  Spinner,
  Text,
  type SegmentOption,
} from '@/components/ui';
import { AccountPicker, CategoryPicker, DatePicker, MethodPicker } from '@/screens/sheets/pickers';
import { useUiStore, type EntrySheetState } from '@/store/uiStore';
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

/**
 * Both bodies use the same height, so swapping to a picker does not resize the
 * sheet under the user's finger.
 */
const SHEET_HEIGHT_RATIO = 0.92;

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
 * Remounted on every open via the store's session counter, so the form starts
 * clean without a dozen `setState` calls in an effect — and because the counter
 * only moves on the way in, the exit animation still plays over the filled form.
 */
export function AddTransactionSheet() {
  const sheet = useUiStore((state) => state.entrySheet);
  const session = useUiStore((state) => state.entrySession);

  return <EntrySheet key={session} sheet={sheet} />;
}

/**
 * The form itself.
 *
 * The whole design serves one number: how many gestures it takes to record a ₹40
 * chai. Open, type, save — three, because the amount pad is already on screen and
 * the category, account and method fall back to whatever was used last. The
 * pickers are one tap away for the times it is something else, and everything
 * optional (merchant, note, date) is a row you can ignore forever.
 *
 * Pickers swap the sheet's body rather than opening a second sheet; see the note
 * in `pickers.tsx` for why.
 */
function EntrySheet({ sheet }: { sheet: EntrySheetState }) {
  const theme = useTheme();
  const close = useUiStore((state) => state.closeEntrySheet);
  const lastUsed = useUiStore((state) => state.lastUsed);
  const rememberChoice = useUiStore((state) => state.rememberChoice);

  const editing = sheet.mode === 'edit' ? sheet.transaction : null;
  const open = sheet.mode !== 'closed';

  const [step, setStep] = useState<Step>('form');
  const [type, setType] = useState<TransactionType>(
    sheet.mode === 'edit' ? sheet.transaction.type : sheet.mode === 'create' ? sheet.type : 'expense',
  );
  const [amount, setAmount] = useState(editing ? paiseToRupeeInput(editing.amount) : '');
  const [date, setDate] = useState(() => (editing ? new Date(editing.date) : new Date()));
  const [merchant, setMerchant] = useState(editing?.merchant ?? '');
  const [note, setNote] = useState(editing?.description ?? '');
  const [showDetails, setShowDetails] = useState(
    Boolean(editing?.merchant || editing?.description),
  );
  const [error, setError] = useState<string | undefined>();

  /**
   * Explicit choices only.
   *
   * `undefined` means "whatever the default works out to", which is resolved
   * below from data that arrives asynchronously. Storing the resolved value
   * instead would need an effect to fill it in once the accounts load, and that
   * effect is exactly the cascading-render pattern React now warns about.
   */
  const [categoryPick, setCategoryPick] = useState<string | undefined>(
    editing?.categoryId ?? undefined,
  );
  const [accountPick, setAccountPick] = useState<string | undefined>(editing?.accountId);
  const [destinationPick, setDestinationPick] = useState<string | undefined>(
    editing?.destinationAccountId ?? undefined,
  );
  const [methodPick, setMethodPick] = useState<PaymentMethod | undefined>(editing?.paymentMethod);

  const accountsQuery = useAccounts();
  const categoriesQuery = useCategories(type === 'transfer' ? undefined : type);

  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const suggestion = useSuggestCategory();
  const saving = createMutation.isPending || updateMutation.isPending;

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const categories = useMemo(
    () => (categoriesQuery.data?.categories ?? []).filter((entry) => entry.type === type),
    [categoriesQuery.data, type],
  );

  const remembered = lastUsed[type];

  const exists = (list: { id: string }[], id?: string) =>
    Boolean(id) && list.some((entry) => entry.id === id);

  // An explicit pick wins, then the last thing used for this type, then the first
  // option. Each fallback is only consulted when the one above it is not available.
  const accountId = exists(accounts, accountPick)
    ? accountPick
    : exists(accounts, remembered?.accountId)
      ? remembered?.accountId
      : accounts[0]?.id;

  const destinationId =
    type !== 'transfer'
      ? undefined
      : exists(accounts, destinationPick) && destinationPick !== accountId
        ? destinationPick
        : exists(accounts, remembered?.destinationAccountId) &&
            remembered?.destinationAccountId !== accountId
          ? remembered?.destinationAccountId
          : accounts.find((entry) => entry.id !== accountId)?.id;

  const categoryId =
    type === 'transfer'
      ? undefined
      : exists(categories, categoryPick)
        ? categoryPick
        : exists(categories, remembered?.categoryId)
          ? remembered?.categoryId
          : categories[0]?.id;

  const method = methodPick ?? remembered?.paymentMethod ?? 'upi';

  const account = accounts.find((entry) => entry.id === accountId);
  const destination = accounts.find((entry) => entry.id === destinationId);
  const category = categories.find((entry) => entry.id === categoryId);

  /**
   * The proposal, but only while it still refers to what is on screen.
   *
   * Checked against the current merchant text and resolved against the loaded
   * category list, so a suggestion can never name a category this user does not
   * have, and never lingers after the field it was about has changed. If it
   * already matches what is selected there is nothing to offer.
   */
  const proposed =
    suggestion.data?.categoryId && suggestion.variables?.merchant === merchant.trim()
      ? categories.find((entry) => entry.id === suggestion.data?.categoryId)
      : undefined;
  const showProposal = Boolean(proposed) && proposed?.id !== categoryId;

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
    // switch. Clearing the pick lets the default resolve against the new list.
    setCategoryPick(undefined);
    suggestion.reset();
    setError(undefined);
  }

  /**
   * Asks what this merchant probably is — once, when the field is finished with.
   *
   * On blur rather than on change: a request per keystroke would be eleven calls
   * to type "Indian Oil", and the answer is only useful once the name is whole.
   * It also never fires twice for the same text, so tabbing back and forth costs
   * nothing.
   *
   * The result is a proposal. Nothing is selected until the user taps Use, which
   * is the whole point — a category quietly changed underneath someone is a
   * mistake they find six weeks later in a chart.
   */
  function requestSuggestion() {
    const name = merchant.trim();
    if (type === 'transfer' || name.length < 3) return;
    if (suggestion.isPending || suggestion.variables?.merchant === name) return;

    suggestion.mutate({
      merchant: name,
      description: note.trim() || undefined,
      amount: paise > 0 ? paise : undefined,
      type: type === 'income' ? 'income' : 'expense',
    });
  }

  const paise = rupeesToPaise(amount);

  function fail(message: string) {
    setError(message);
    errorFeedback();
  }

  async function handleSubmit() {
    if (paise <= 0) return fail('Enter an amount greater than zero');
    if (!accountId) return fail('Pick an account');
    if (type === 'transfer' && !destinationId) return fail('Pick an account to transfer into');
    if (type === 'transfer' && destinationId === accountId) {
      return fail('Transfer between two different accounts');
    }
    if (type !== 'transfer' && !categoryId) return fail('Pick a category');

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
        maxHeightRatio={SHEET_HEIGHT_RATIO}
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
            setCategoryPick(picked.id);
            setStep('form');
          }}
          onPickAccount={(picked: Account) => {
            if (step === 'destination') setDestinationPick(picked.id);
            else setAccountPick(picked.id);
            setStep('form');
          }}
          onPickMethod={(picked) => {
            setMethodPick(picked);
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
      maxHeightRatio={SHEET_HEIGHT_RATIO}
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
            onPress={() => void handleSubmit()}
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
                  label="Category"
                  value={category?.name ?? 'Pick'}
                  icon={toIconName(category?.icon)}
                  tint={category ? categoryColor(category.color) : undefined}
                  onPress={() => setStep('category')}
                />
                <Selector
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
              label="Date"
              value={formatDayLabel(date.toISOString())}
              icon="calendar"
              onPress={() => setStep('date')}
            />
            <Selector
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
            onBlur={requestSuggestion}
            returnKeyType="next"
            maxLength={120}
          />

          {suggestion.isPending ? (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
              accessibilityLiveRegion="polite"
            >
              <Spinner />
              <Text variant="caption" tone="tertiary">
                Working out a category…
              </Text>
            </View>
          ) : showProposal && proposed ? (
            <CategoryProposal
              category={proposed}
              confidence={suggestion.data?.confidence ?? 'low'}
              reason={suggestion.data?.reason ?? ''}
              onUse={() => {
                tapFeedback();
                setCategoryPick(proposed.id);
                suggestion.reset();
              }}
              onDismiss={() => suggestion.reset()}
            />
          ) : null}
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

type CategoryProposalProps = {
  category: Category;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  onUse: () => void;
  onDismiss: () => void;
};

/**
 * A suggested category, offered rather than applied.
 *
 * It states what it thinks, how sure it is and why, and then waits. Nothing is
 * filed until "Use" is tapped, and the reason is on screen so a wrong guess is
 * obvious before it is accepted instead of after. Low confidence is labelled as
 * such rather than hidden — an assistant that sounds equally certain about
 * "Swiggy" and "NEFT/Ref 88213" teaches people to stop reading it.
 */
function CategoryProposal({
  category,
  confidence,
  reason,
  onUse,
  onDismiss,
}: CategoryProposalProps) {
  const theme = useTheme();
  const tint = categoryColor(category.color);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon name="sparkles" size={15} color={theme.colors.brandText} strokeWidth={2} />
        <Text variant="caption" tone="tertiary" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
          Suggested category
        </Text>
        {confidence === 'low' ? <Badge label="Not sure" tone="warning" /> : null}
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss suggestion"
        >
          <Icon name="close" size={15} color={theme.colors.textTertiary} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <IconTile name={toIconName(category.icon)} color={tint} size="sm" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="labelSm" numberOfLines={1}>
            {category.name}
          </Text>
          {reason ? (
            <Text variant="caption" tone="tertiary" numberOfLines={2}>
              {reason}
            </Text>
          ) : null}
        </View>
        <Button label="Use" variant="tonal" size="sm" onPress={onUse} haptic={false} />
      </View>
    </View>
  );
}

type SelectorProps = {
  label: string;
  value: string;
  icon: ReturnType<typeof toIconName>;
  tint?: string;
  onPress: () => void;
};

/** One tappable slot on the entry form: a tinted glyph, a label and the choice. */
function Selector({ label, value, icon, tint, onPress }: SelectorProps) {
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
        flex: 1,
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
