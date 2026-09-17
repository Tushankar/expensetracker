import * as ImagePicker from 'expo-image-picker';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import {
  errorMessage,
  useAccounts,
  useAttachReceipt,
  useCategories,
  useCreateTransaction,
  useDeleteReceipt,
  useExtractReceipt,
  useParseQuickEntry,
  useReceiptStatus,
  useSuggestCategory,
  useUpdateTransaction,
  useUploadReceipt,
  type Account,
  type Category,
  type CreateTransactionInput,
  type PaymentMethod,
  type QuickEntryProposal,
  type Receipt,
  type TransactionType,
} from '@/api';
import { PAYMENT_METHOD_LABEL, isPaymentMethod } from '@/api/types';
import { toIconName } from '@/components/icons/registry';
import {
  Badge,
  BottomSheet,
  Button,
  Icon,
  IconButton,
  IconTile,
  Input,
  Keypad,
  LoadingState,
  SegmentedControl,
  Spinner,
  Text,
  type SegmentOption,
} from '@/components/ui';
import { ProposalPreview, QuickEntryPanel, ReceiptPanel } from '@/components/entry';
import { AccountPicker, CategoryPicker, DatePicker, MethodPicker } from '@/screens/sheets/pickers';
import { useUiStore, type EntrySheetState } from '@/store/uiStore';
import { categoryColor, useTheme } from '@/theme';
import {
  RUPEE,
  applyAmountKey,
  formatAmountInput,
  formatINR,
  paiseToRupeeInput,
  rupeesToPaise,
} from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';
import { errorFeedback, mediumFeedback, successFeedback, tapFeedback } from '@/utils/haptics';

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

/**
 * Which panel the sheet is showing. `form` is the amount pad — the default, and
 * the one the whole design is tuned for.
 *
 * `quick`, `preview` and `receipt` are alternative ways *in*, reached from two
 * icons in the header rather than from anything in the body. That placement is
 * the point: three input methods should cost the fast path nothing, and a row of
 * mode switches above the keypad would cost it a glance every single time.
 */
type Step =
  | 'form'
  | 'category'
  | 'account'
  | 'destination'
  | 'method'
  | 'date'
  | 'quick'
  | 'preview'
  | 'receipt';

const STEP_TITLE: Record<Exclude<Step, 'form'>, string> = {
  category: 'Choose a category',
  account: 'Pay from',
  destination: 'Transfer to',
  method: 'How did you pay?',
  date: 'When was this?',
  quick: 'Type it out',
  preview: 'Does this look right?',
  receipt: 'Scan a bill',
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
  const showToast = useUiStore((state) => state.showToast);

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

  // ---------------------------------------------------------- quick + receipt
  const parseQuick = useParseQuickEntry();
  const receiptStatus = useReceiptStatus();
  const uploadReceipt = useUploadReceipt();
  const extractReceipt = useExtractReceipt();
  const attachReceipt = useAttachReceipt();
  const deleteReceipt = useDeleteReceipt();

  const [proposal, setProposal] = useState<QuickEntryProposal | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
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

  /**
   * Fills the form from a proposal, without saving it.
   *
   * Used by both alternative entry paths, and by `Edit` on the preview. Every
   * field lands in the same state the keypad writes to, so what follows is the
   * ordinary form with the ordinary Save button — there is no second write path
   * that could behave differently from the one people use every day.
   */
  function applyProposal(next: QuickEntryProposal) {
    if (next.amount !== null) setAmount(paiseToRupeeInput(next.amount));
    if (next.merchant) {
      setMerchant(next.merchant);
      setShowDetails(true);
    }
    if (next.categoryId) setCategoryPick(next.categoryId);
    if (next.accountId) setAccountPick(next.accountId);
    setMethodPick(next.paymentMethod);
    setDate(new Date(next.date));
    setError(undefined);
  }

  function handleParsed(text: string) {
    parseQuick.mutate(
      { text, type: type === 'transfer' ? 'expense' : type },
      {
        onSuccess: (result) => {
          setProposal(result);
          // A parse with no amount is not a result worth previewing — it goes
          // straight to the form with whatever it did find, which is faster than
          // showing someone a confirmation card with a dash on it.
          if (result.amount === null) {
            applyProposal(result);
            setStep('form');
            errorFeedback();
            setError('No amount in that. Type it on the keypad.');
            return;
          }
          successFeedback();
          setStep('preview');
        },
      },
    );
  }

  /**
   * Saves straight from the preview.
   *
   * The proposal is applied to the form state first and then submitted, so this
   * goes through exactly the same validation and the same mutation as a manual
   * entry. A shortcut that wrote directly would be a second code path to keep
   * correct, and the one that gets it wrong is always the one used less.
   */
  async function saveProposal() {
    if (!proposal || proposal.amount === null || !proposal.categoryId) return;

    const accountForSave = proposal.accountId ?? accountId;
    if (!accountForSave) return fail('Pick an account');

    try {
      const createdTransaction = await createMutation.mutateAsync({
        type: type === 'transfer' ? 'expense' : type,
        amount: proposal.amount,
        accountId: accountForSave,
        categoryId: proposal.categoryId,
        merchant: proposal.merchant,
        description: '',
        paymentMethod: proposal.paymentMethod,
        date: new Date(proposal.date).toISOString(),
      });

      if (receipt) await attachReceipt.mutateAsync({ id: receipt.id, transactionId: createdTransaction.id });

      rememberChoice(type === 'transfer' ? 'expense' : type, {
        accountId: accountForSave,
        categoryId: proposal.categoryId,
        paymentMethod: proposal.paymentMethod,
      });
      successFeedback();
      showToast({
        message: 'Saved',
        detail: [formatINR(proposal.amount), proposal.categoryName].filter(Boolean).join('  ·  '),
      });
      handleClose();
    } catch (cause) {
      errorFeedback();
      setError(errorMessage(cause));
    }
  }

  // ------------------------------------------------------------------ receipt

  /**
   * Picks an image, uploads it, then reads it.
   *
   * Permission is requested at the moment it is needed rather than on launch,
   * which is both the platform guidance and simply more honest: an app that asks
   * for the camera before you have asked it for anything is one you say no to.
   */
  async function pickImage(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        source === 'camera' ? 'Camera access is off' : 'Photo access is off',
        'Paisa needs it to attach a bill. You can turn it on in Settings.',
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });

    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;

    setUploadProgress(0);
    try {
      const stored = await uploadReceipt.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType,
        onProgress: setUploadProgress,
      });
      setReceipt(stored);
      mediumFeedback();

      if (receiptStatus.data?.reading) {
        const read = await extractReceipt.mutateAsync(stored.id);
        setReceipt(read);
        successFeedback();
      }
    } catch {
      errorFeedback();
    } finally {
      setUploadProgress(null);
    }
  }

  /**
   * Takes what the bill said into the form.
   *
   * Only fields that were actually legible, and only into the form — never into a
   * saved transaction. Anything the model could not read is left exactly as the
   * user had it, because overwriting a typed amount with a blank would be the
   * worst possible reading of "extract".
   */
  function applyReceipt() {
    const extraction = receipt?.extraction;

    if (extraction) {
      if (extraction.amount !== null) setAmount(paiseToRupeeInput(extraction.amount));
      if (extraction.merchant) {
        setMerchant(extraction.merchant);
        setShowDetails(true);
      }
      if (extraction.date) setDate(new Date(extraction.date));
      if (extraction.paymentMethod && isPaymentMethod(extraction.paymentMethod)) {
        setMethodPick(extraction.paymentMethod);
      }

      // The category is never on a receipt, so it is asked for the same way it is
      // anywhere else: from the merchant, through memory first.
      if (extraction.merchant) {
        suggestion.mutate({
          merchant: extraction.merchant,
          amount: extraction.amount ?? undefined,
          type: type === 'income' ? 'income' : 'expense',
        });
      }
    }

    tapFeedback();
    setStep('form');
  }

  function discardReceipt() {
    const current = receipt;
    setReceipt(null);
    setStep('form');
    if (current) deleteReceipt.mutate(current.id);
  }

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
        const saved = await createMutation.mutateAsync(input);

        // The receipt was uploaded before the transaction existed, which is the
        // natural order at a counter. This is where the two meet.
        if (receipt) await attachReceipt.mutateAsync({ id: receipt.id, transactionId: saved.id });
      }

      rememberChoice(type, {
        accountId,
        destinationAccountId: destinationId,
        categoryId,
        paymentMethod: method,
      });
      successFeedback();
      // The sheet is about to unmount, so the confirmation is raised through the
      // store: "saved" has to outlive the screen that saved it. It names the
      // amount as well, because ₹40 and ₹4,000 look identical once the sheet has
      // gone and only one of them is worth a second look.
      showToast({
        message: type === 'transfer' ? 'Transfer recorded' : 'Saved',
        detail: [formatINR(paise), category?.name ?? merchant.trim()].filter(Boolean).join('  ·  '),
      });
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

  // ----------------------------------------------------- the typed way in
  if (step === 'quick') {
    return (
      <BottomSheet
        visible={open}
        onClose={() => setStep('form')}
        title={STEP_TITLE.quick}
        subtitle="One line. Nothing is saved until you confirm."
        maxHeightRatio={SHEET_HEIGHT_RATIO}
      >
        <QuickEntryPanel
          onSubmit={handleParsed}
          loading={parseQuick.isPending}
          error={parseQuick.error}
        />
        <View style={{ height: theme.spacing.xl }} />
      </BottomSheet>
    );
  }

  if (step === 'preview' && proposal) {
    return (
      <BottomSheet
        visible={open}
        onClose={() => setStep('form')}
        title={STEP_TITLE.preview}
        maxHeightRatio={SHEET_HEIGHT_RATIO}
      >
        <ProposalPreview
          proposal={proposal}
          accountName={
            accounts.find((entry) => entry.id === proposal.accountId)?.name ??
            proposal.accountName ??
            undefined
          }
          methodLabel={PAYMENT_METHOD_LABEL[proposal.paymentMethod]}
          saving={createMutation.isPending}
          onSave={() => void saveProposal()}
          onEdit={() => {
            applyProposal(proposal);
            tapFeedback();
            setStep('form');
          }}
        />
        <View style={{ height: theme.spacing.xl }} />
      </BottomSheet>
    );
  }

  // ------------------------------------------------------------ the bill
  if (step === 'receipt') {
    return (
      <BottomSheet
        visible={open}
        onClose={() => setStep('form')}
        title={STEP_TITLE.receipt}
        maxHeightRatio={SHEET_HEIGHT_RATIO}
      >
        <ReceiptPanel
          receipt={receipt}
          progress={uploadProgress}
          uploading={uploadReceipt.isPending || uploadProgress !== null}
          reading={extractReceipt.isPending}
          canRead={receiptStatus.data?.reading ?? false}
          error={uploadReceipt.error ?? extractReceipt.error}
          onPickCamera={() => void pickImage('camera')}
          onPickLibrary={() => void pickImage('library')}
          onApply={applyReceipt}
          onDiscard={discardReceipt}
        />
        <View style={{ height: theme.spacing.xl }} />
      </BottomSheet>
    );
  }

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
      headerAction={
        editing ? undefined : (
          <>
            <IconButton
              name="sparkles"
              onPress={() => {
                tapFeedback();
                parseQuick.reset();
                setStep('quick');
              }}
              accessibilityLabel="Type it out instead"
              accessibilityHint="Reads a line like Petrol 1200 into a transaction"
              variant="tonal"
              size="sm"
            />
            {receiptStatus.data?.storage ? (
              <IconButton
                name="camera"
                onPress={() => {
                  tapFeedback();
                  setStep('receipt');
                }}
                accessibilityLabel="Scan a bill"
                accessibilityHint="Photograph a receipt and read the amount from it"
                variant="tonal"
                size="sm"
              />
            ) : null}
          </>
        )
      }
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
              source={suggestion.data?.source ?? 'none'}
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

      {/* A receipt attached but not yet saved. Shown on the form rather than
          left behind on a panel nobody returns to, because an image the user
          cannot see is an image they will assume was lost. */}
      {receipt ? (
        <Pressable
          onPress={() => {
            tapFeedback();
            setStep('receipt');
          }}
          accessibilityRole="button"
          accessibilityLabel="Receipt attached. Opens the bill."
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            marginTop: theme.spacing.md,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radius.sm,
            backgroundColor: pressed ? theme.colors.surfaceStrong : theme.colors.surfaceMuted,
          })}
        >
          <Icon name="scan" size={15} color={theme.colors.brandText} />
          <Text variant="caption" tone="secondary" style={{ flex: 1 }} numberOfLines={1}>
            Receipt attached
          </Text>
          <Icon name="chevronRight" size={14} color={theme.colors.textTertiary} />
        </Pressable>
      ) : null}

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
  /** Where the suggestion came from, which is what the badge announces. */
  source: 'memory' | 'merchant' | 'model' | 'none';
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
  source,
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
        {/* Where it came from, said plainly. "You filed this here before" earns a
            different amount of trust from "a model thinks so", and the user is
            the one who should be deciding how much. */}
        {source === 'memory' ? (
          <Badge label="From your history" tone="positive" />
        ) : confidence === 'low' ? (
          <Badge label="Not sure" tone="warning" />
        ) : null}
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
