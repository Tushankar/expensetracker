import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useLayoutEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import {
  RECURRENCE_PRESETS,
  RECURRENCE_UNIT_LABEL,
  errorMessage,
  isApiError,
  useAccounts,
  useCategories,
  useCreateRecurring,
  useDeleteRecurring,
  usePauseRecurring,
  useRecurring,
  useUpdateRecurring,
  type Account,
  type Category,
  type CreateRecurringInput,
  type PaymentMethod,
  type RecurrenceUnit,
  type RecurringRule,
  type TransactionType,
} from '@/api';
import { PAYMENT_METHOD_LABEL } from '@/api/types';
import { QueryState } from '@/components/data/QueryState';
import { toIconName } from '@/components/icons/registry';
import {
  BottomSheet,
  Button,
  Calendar,
  Card,
  Icon,
  IconTile,
  Input,
  Keypad,
  Screen,
  SegmentedControl,
  Text,
  type SegmentOption,
} from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';
import { AccountPicker, CategoryPicker, MethodPicker } from '@/screens/sheets/pickers';
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

type Picker = 'none' | 'category' | 'account' | 'destination' | 'method' | 'start' | 'custom';

/**
 * Create or edit a recurring rule.
 *
 * A screen rather than a sheet: there are three pickers, a schedule and an
 * amount, and stacking that into a sheet would mean a form you scroll through a
 * keyboard to reach the bottom of.
 */
export function RecurringFormScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'RecurringForm'>>();
  const theme = useTheme();
  const ruleId = route.params?.id;
  const editing = Boolean(ruleId);

  const rulesQuery = useRecurring(true);
  const existing = rulesQuery.data?.find((rule) => rule.id === ruleId);

  useLayoutEffect(() => {
    navigation.setOptions({ title: editing ? 'Edit recurring' : 'New recurring' });
  }, [navigation, editing]);

  return (
    <Screen topInset={false} bottomInset={theme.spacing.xxl} testID="recurring-form">
      <QueryState
        isLoading={editing && rulesQuery.isLoading}
        error={rulesQuery.error}
        isEmpty={editing && !rulesQuery.isLoading && !existing}
        onRetry={() => void rulesQuery.refetch()}
        loadingLabel="Loading the rule"
        empty={{
          icon: 'repeat',
          title: 'Not found',
          description: 'This recurring transaction may have been deleted on another device.',
        }}
      >
        <RecurringForm key={existing?.id ?? 'new'} existing={existing} />
      </QueryState>
    </Screen>
  );
}

function RecurringForm({ existing }: { existing?: RecurringRule }) {
  const theme = useTheme();
  const navigation = useNavigation();
  const editing = Boolean(existing);

  // One clock reading per mount; see the note in UpcomingCard.
  const [now] = useState(() => Date.now());
  const [picker, setPicker] = useState<Picker>('none');
  const [type, setType] = useState<TransactionType>(existing?.type ?? 'expense');
  const [name, setName] = useState(existing?.name ?? '');
  const [amount, setAmount] = useState(existing ? paiseToRupeeInput(existing.amount) : '');
  const [unit, setUnit] = useState<RecurrenceUnit>(existing?.unit ?? 'month');
  const [interval, setInterval] = useState(existing?.interval ?? 1);
  const [startDate, setStartDate] = useState(() =>
    existing ? new Date(existing.startDate) : new Date(),
  );
  const [autoCreate, setAutoCreate] = useState(existing?.autoCreate ?? true);
  const [error, setError] = useState<string | undefined>();

  const [categoryPick, setCategoryPick] = useState<string | undefined>(
    existing?.categoryId ?? undefined,
  );
  const [accountPick, setAccountPick] = useState<string | undefined>(existing?.accountId);
  const [destinationPick, setDestinationPick] = useState<string | undefined>(
    existing?.destinationAccountId ?? undefined,
  );
  const [methodPick, setMethodPick] = useState<PaymentMethod | undefined>(existing?.paymentMethod);

  const accountsQuery = useAccounts();
  const categoriesQuery = useCategories(type === 'transfer' ? undefined : type);
  const create = useCreateRecurring();
  const update = useUpdateRecurring();
  const remove = useDeleteRecurring();
  const pause = usePauseRecurring();
  const saving = create.isPending || update.isPending;

  const accounts = accountsQuery.data ?? [];
  const categories = (categoriesQuery.data?.categories ?? []).filter(
    (entry) => entry.type === type,
  );

  const exists = (list: { id: string }[], id?: string) =>
    Boolean(id) && list.some((entry) => entry.id === id);

  const accountId = exists(accounts, accountPick) ? accountPick : accounts[0]?.id;
  const destinationId =
    type !== 'transfer'
      ? undefined
      : exists(accounts, destinationPick) && destinationPick !== accountId
        ? destinationPick
        : accounts.find((entry) => entry.id !== accountId)?.id;
  const categoryId =
    type === 'transfer'
      ? undefined
      : exists(categories, categoryPick)
        ? categoryPick
        : categories[0]?.id;
  const method = methodPick ?? 'upi';

  const account = accounts.find((entry) => entry.id === accountId);
  const destination = accounts.find((entry) => entry.id === destinationId);
  const category = categories.find((entry) => entry.id === categoryId);

  const paise = rupeesToPaise(amount);
  const scheduleText =
    interval === 1 ? `Every ${unit}` : `Every ${interval} ${RECURRENCE_UNIT_LABEL[unit]}`;

  /**
   * What the rule will actually do first, said before it does it.
   *
   * A start date in the past records the most recent occurrence straight away —
   * useful, and surprising if it is not spelled out. This line is what turns it
   * from a surprise into a choice.
   */
  const firstRunNote = (() => {
    if (!autoCreate) return 'You will get a reminder. Nothing is recorded for you.';
    return startDate.getTime() <= now
      ? 'The first one is recorded as soon as you save.'
      : `The first one is recorded on ${formatDayLabel(startDate.toISOString())}.`;
  })();

  function fail(message: string) {
    setError(message);
    errorFeedback();
  }

  async function handleSave() {
    if (name.trim().length === 0) return fail('Give it a name');
    if (paise <= 0) return fail('Enter an amount greater than zero');
    if (!accountId) return fail('Pick an account');
    if (type === 'transfer' && !destinationId) return fail('Pick an account to transfer into');
    if (type !== 'transfer' && !categoryId) return fail('Pick a category');

    const base = {
      name: name.trim(),
      amount: paise,
      accountId,
      paymentMethod: method,
      unit,
      interval,
      startDate: startDate.toISOString(),
      autoCreate,
    };

    try {
      if (existing) {
        await update.mutateAsync({
          id: existing.id,
          patch:
            type === 'transfer'
              ? { ...base, destinationAccountId: destinationId }
              : { ...base, categoryId },
        });
      } else {
        const input: CreateRecurringInput =
          type === 'transfer'
            ? { type, ...base, destinationAccountId: destinationId as string }
            : { type, ...base, categoryId: categoryId as string };
        await create.mutateAsync(input);
      }
      successFeedback();
      navigation.goBack();
    } catch (cause) {
      errorFeedback();
      setError(
        isApiError(cause) && cause.issues.length > 0
          ? (cause.issues[0]?.message ?? cause.message)
          : errorMessage(cause),
      );
    }
  }

  function confirmDelete() {
    if (!existing) return;
    Alert.alert(
      'Delete this recurring transaction?',
      'The transactions it already recorded stay exactly where they are — only the rule goes.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(existing.id, {
              onSuccess() {
                successFeedback();
                navigation.goBack();
              },
              onError(cause) {
                errorFeedback();
                setError(errorMessage(cause));
              },
            }),
        },
      ],
    );
  }

  return (
    <>
      <View style={{ gap: theme.spacing.lg, marginTop: theme.spacing.sm }}>
        {editing ? null : (
          <SegmentedControl
            options={KIND_OPTIONS}
            value={type}
            onChange={(next) => {
              setType(next);
              setCategoryPick(undefined);
              setError(undefined);
            }}
            accessibilityLabel="Transaction type"
          />
        )}

        <Input
          label="Name"
          placeholder="Rent, Netflix, Gym…"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          maxLength={120}
          returnKeyType="done"
        />

        <View style={{ alignItems: 'center', paddingVertical: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
            <Text variant="h2" tone="tertiary" style={{ marginTop: 4 }}>
              {RUPEE}
            </Text>
            <Text
              variant="display"
              tone={amount === '' ? 'tertiary' : 'primary'}
              numberOfLines={1}
              adjustsFontSizeToFit
              accessibilityLabel={`Amount ${formatAmountInput(amount)} rupees`}
            >
              {formatAmountInput(amount)}
            </Text>
          </View>
        </View>

        <Keypad
          onKey={(key) => {
            setAmount((current) => applyAmountKey(current, key));
            if (error) setError(undefined);
          }}
          onLongBackspace={() => setAmount('')}
        />

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {type === 'transfer' ? (
            <>
              <Slot
                label="From"
                value={account?.name ?? 'Pick'}
                icon={toIconName(account?.icon)}
                tint={account?.color}
                onPress={() => setPicker('account')}
              />
              <Slot
                label="To"
                value={destination?.name ?? 'Pick'}
                icon={toIconName(destination?.icon)}
                tint={destination?.color}
                onPress={() => setPicker('destination')}
              />
            </>
          ) : (
            <>
              <Slot
                label="Category"
                value={category?.name ?? 'Pick'}
                icon={toIconName(category?.icon)}
                tint={category ? categoryColor(category.color) : undefined}
                onPress={() => setPicker('category')}
              />
              <Slot
                label="Account"
                value={account?.name ?? 'Pick'}
                icon={toIconName(account?.icon)}
                tint={account?.color}
                onPress={() => setPicker('account')}
              />
            </>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Slot
            label="Starts"
            value={formatDayLabel(startDate.toISOString())}
            icon="calendar"
            onPress={() => setPicker('start')}
          />
          <Slot
            label="Method"
            value={PAYMENT_METHOD_LABEL[method]}
            icon="card"
            onPress={() => setPicker('method')}
          />
        </View>

        <View>
          <Text variant="labelSm" tone="secondary" style={{ marginBottom: theme.spacing.sm }}>
            Repeats
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {RECURRENCE_PRESETS.map((preset) => {
              const active = preset.unit === unit && preset.interval === interval;
              return (
                <Chip
                  key={preset.label}
                  label={preset.label}
                  active={active}
                  onPress={() => {
                    setUnit(preset.unit);
                    setInterval(preset.interval);
                  }}
                />
              );
            })}
            <Chip
              label={
                RECURRENCE_PRESETS.some(
                  (preset) => preset.unit === unit && preset.interval === interval,
                )
                  ? 'Custom'
                  : scheduleText
              }
              active={
                !RECURRENCE_PRESETS.some(
                  (preset) => preset.unit === unit && preset.interval === interval,
                )
              }
              icon="settings"
              onPress={() => setPicker('custom')}
            />
          </View>
        </View>

        <Card variant="muted" radius="md" padding="lg">
          <Pressable
            onPress={() => {
              tapFeedback();
              setAutoCreate((current) => !current);
            }}
            accessibilityRole="switch"
            accessibilityLabel="Record it automatically"
            accessibilityState={{ checked: autoCreate }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
          >
            <Icon
              name={autoCreate ? 'checkCircle' : 'circle'}
              size={22}
              color={autoCreate ? theme.colors.brandText : theme.colors.textTertiary}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="labelSm">Record it for me</Text>
              <Text variant="caption" tone="tertiary">
                {autoCreate
                  ? 'Paisa writes the transaction each time'
                  : 'Paisa only reminds you — useful for bills that change'}
              </Text>
            </View>
          </Pressable>
        </Card>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.brandSurface,
          }}
        >
          <Icon name="info" size={16} color={theme.colors.brandText} />
          <Text variant="caption" color={theme.colors.brandText} style={{ flex: 1 }}>
            {`${scheduleText}. ${firstRunNote}`}
          </Text>
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
        label={editing ? 'Save changes' : 'Create'}
        onPress={() => void handleSave()}
        variant="brand"
        size="lg"
        fullWidth
        loading={saving}
        style={{ marginTop: theme.spacing.xxl }}
      />

      {existing ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.md }}>
          <Button
            label={existing.isPaused ? 'Resume' : 'Pause'}
            variant="secondary"
            size="md"
            loading={pause.isPending}
            onPress={() => pause.mutate({ id: existing.id, paused: !existing.isPaused })}
            style={{ flex: 1 }}
          />
          <Button
            label="Delete"
            variant="ghost"
            size="md"
            loading={remove.isPending}
            onPress={confirmDelete}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}

      <PickerSheets
        picker={picker}
        close={() => setPicker('none')}
        accounts={accounts}
        categories={categories}
        categoryId={categoryId}
        accountId={accountId}
        destinationId={destinationId}
        method={method}
        startDate={startDate}
        maxStart={new Date(now + 365 * 86_400_000)}
        unit={unit}
        interval={interval}
        onPickCategory={(picked: Category) => {
          setCategoryPick(picked.id);
          setPicker('none');
        }}
        onPickAccount={(picked: Account) => {
          if (picker === 'destination') setDestinationPick(picked.id);
          else setAccountPick(picked.id);
          setPicker('none');
        }}
        onPickMethod={(picked) => {
          setMethodPick(picked);
          setPicker('none');
        }}
        onPickStart={(date) => {
          setStartDate(date);
          setPicker('none');
        }}
        onPickSchedule={(nextUnit, nextInterval) => {
          setUnit(nextUnit);
          setInterval(nextInterval);
          setPicker('none');
        }}
      />
    </>
  );
}

function Slot({
  label,
  value,
  icon,
  tint,
  onPress,
}: {
  label: string;
  value: string;
  icon: ReturnType<typeof toIconName>;
  tint?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
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

function Chip({
  label,
  active,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon?: ReturnType<typeof toIconName>;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: 40,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.pill,
        backgroundColor: active ? theme.colors.brandSurface : theme.colors.surfaceMuted,
        borderWidth: theme.layout.hairline,
        borderColor: active ? theme.colors.brand : 'transparent',
      }}
    >
      {icon ? (
        <Icon
          name={icon}
          size={13}
          color={active ? theme.colors.brandText : theme.colors.textTertiary}
        />
      ) : null}
      <Text
        variant="labelSm"
        color={active ? theme.colors.brandText : theme.colors.textSecondary}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type PickerSheetsProps = {
  picker: Picker;
  close: () => void;
  accounts: Account[];
  categories: Category[];
  categoryId?: string;
  accountId?: string;
  destinationId?: string;
  method: PaymentMethod;
  startDate: Date;
  maxStart: Date;
  unit: RecurrenceUnit;
  interval: number;
  onPickCategory: (category: Category) => void;
  onPickAccount: (account: Account) => void;
  onPickMethod: (method: PaymentMethod) => void;
  onPickStart: (date: Date) => void;
  onPickSchedule: (unit: RecurrenceUnit, interval: number) => void;
};

function PickerSheets(props: PickerSheetsProps) {
  const theme = useTheme();
  const { picker, close } = props;

  const title =
    picker === 'category'
      ? 'Choose a category'
      : picker === 'account'
        ? 'Pay from'
        : picker === 'destination'
          ? 'Transfer to'
          : picker === 'method'
            ? 'How is it paid?'
            : picker === 'start'
              ? 'First occurrence'
              : 'Custom schedule';

  return (
    <BottomSheet
      visible={picker !== 'none'}
      onClose={close}
      title={title}
      maxHeightRatio={0.9}
    >
      {picker === 'category' ? (
        <CategoryPicker
          categories={props.categories}
          selectedId={props.categoryId}
          onSelect={props.onPickCategory}
        />
      ) : null}

      {picker === 'account' || picker === 'destination' ? (
        <AccountPicker
          accounts={props.accounts}
          selectedId={picker === 'destination' ? props.destinationId : props.accountId}
          excludeId={picker === 'destination' ? props.accountId : props.destinationId}
          onSelect={props.onPickAccount}
        />
      ) : null}

      {picker === 'method' ? (
        <MethodPicker selected={props.method} onSelect={props.onPickMethod} />
      ) : null}

      {picker === 'start' ? (
        <View>
          {/* A rule may legitimately start in the future — next month's rent, a
              subscription that begins on renewal — so the usual "no future dates"
              rule is lifted here. */}
          <Calendar
            value={props.startDate}
            onChange={props.onPickStart}
            maxDate={props.maxStart}
            initialMonth={props.startDate}
          />
          <View style={{ height: theme.spacing.xl }} />
        </View>
      ) : null}

      {picker === 'custom' ? (
        <CustomSchedule
          unit={props.unit}
          interval={props.interval}
          onApply={props.onPickSchedule}
        />
      ) : null}
    </BottomSheet>
  );
}

const UNITS: readonly RecurrenceUnit[] = ['day', 'week', 'month', 'year'];

function CustomSchedule({
  unit,
  interval,
  onApply,
}: {
  unit: RecurrenceUnit;
  interval: number;
  onApply: (unit: RecurrenceUnit, interval: number) => void;
}) {
  const theme = useTheme();
  const [draftUnit, setDraftUnit] = useState(unit);
  const [draftInterval, setDraftInterval] = useState(String(interval));

  const parsed = Math.max(1, Math.min(365, Number.parseInt(draftInterval, 10) || 1));
  const preview = parsed === 1 ? `Every ${draftUnit}` : `Every ${parsed} ${RECURRENCE_UNIT_LABEL[draftUnit]}`;

  return (
    <View>
      <Text variant="labelSm" tone="secondary" style={{ marginBottom: theme.spacing.sm }}>
        Repeat every
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Input
          value={draftInterval}
          onChangeText={(next) => setDraftInterval(next.replace(/\D/g, '').slice(0, 3))}
          keyboardType="number-pad"
          maxLength={3}
          containerStyle={{ width: 88 }}
          accessibilityLabel="How many"
        />
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {UNITS.map((option) => (
            <Chip
              key={option}
              label={RECURRENCE_UNIT_LABEL[option]}
              active={option === draftUnit}
              onPress={() => setDraftUnit(option)}
            />
          ))}
        </View>
      </View>

      <Text variant="bodySm" tone="secondary" align="center" style={{ marginTop: theme.spacing.xl }}>
        {preview}
      </Text>

      <Button
        label="Use this schedule"
        variant="brand"
        size="lg"
        fullWidth
        onPress={() => onApply(draftUnit, parsed)}
        style={{ marginTop: theme.spacing.lg }}
      />
      <View style={{ height: theme.spacing.xl }} />
    </View>
  );
}
