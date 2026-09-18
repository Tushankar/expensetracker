import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import {
  errorMessage,
  isApiError,
  useCategories,
  useCreateBudget,
  useDeleteBudget,
  useUpdateBudget,
  type BudgetProgress,
  type Category,
} from '@/api';
import { toIconName } from '@/components/icons/registry';
import {
  BottomSheet,
  Button,
  Divider,
  Icon,
  IconTile,
  Input,
  Keypad,
  SegmentedControl,
  Text,
  type SegmentOption,
} from '@/components/ui';
import { categoryColor, useTheme } from '@/theme';
import {
  RUPEE,
  applyAmountKey,
  formatAmountInput,
  formatINR,
  paiseToRupeeInput,
  rupeesToPaise,
} from '@/utils/currency';
import { errorFeedback, successFeedback, tapFeedback } from '@/utils/haptics';

type Scope = 'overall' | 'category';

const SCOPES: readonly SegmentOption<Scope>[] = [
  { value: 'overall', label: 'Everything' },
  { value: 'category', label: 'One category' },
];

/** The thresholds worth offering. A slider for a number with three useful values is theatre. */
const WARN_OPTIONS = [70, 80, 90] as const;

export type BudgetFormSheetProps = {
  visible: boolean;
  /** Null creates; a budget edits it. */
  budget: BudgetProgress | null;
  /** Hides the "Everything" option when an overall budget already exists. */
  hasOverall: boolean;
  /** Categories that already have a cap, so the picker cannot offer a duplicate. */
  budgetedCategoryIds: Set<string>;
  onClose: () => void;
  initialScope?: Scope;
  initialCategoryId?: string;
  initialAmount?: string;
};

/**
 * Create or edit a budget.
 *
 * Uses the same amount keypad as the transaction sheet, because setting a cap is
 * the same gesture as recording a spend and should not feel like a different app.
 *
 * The scope and the category are fixed once created: moving a budget from Food to
 * Transport is two budgets with two different histories, and a patch that
 * silently rewrote what last month meant would be worse than making it explicit.
 */
export function BudgetFormSheet({
  visible,
  budget,
  hasOverall,
  budgetedCategoryIds,
  onClose,
  initialScope,
  initialCategoryId,
  initialAmount,
}: BudgetFormSheetProps) {
  const theme = useTheme();
  const editing = budget !== null;

  const [step, setStep] = useState<'form' | 'category'>('form');
  const [scope, setScope] = useState<Scope>(
    budget?.scope ?? initialScope ?? (hasOverall ? 'category' : 'overall'),
  );
  const [categoryId, setCategoryId] = useState<string | undefined>(
    budget?.categoryId ?? initialCategoryId ?? undefined,
  );
  const [amount, setAmount] = useState(
    budget ? paiseToRupeeInput(budget.amount) : (initialAmount ?? ''),
  );
  const [warnAt, setWarnAt] = useState(budget?.warnAtPercent ?? 80);
  const [error, setError] = useState<string | undefined>();

  const categoriesQuery = useCategories('expense');
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const remove = useDeleteBudget();
  const saving = create.isPending || update.isPending;

  const allCategories = categoriesQuery.data?.categories ?? [];
  // A category that already has a cap would only ever produce a 409.
  const available = allCategories.filter(
    (category) => category.id === categoryId || !budgetedCategoryIds.has(category.id),
  );
  const category = allCategories.find((entry) => entry.id === categoryId);

  const paise = rupeesToPaise(amount);

  async function handleSubmit() {
    if (paise <= 0) {
      setError('Enter an amount greater than zero');
      errorFeedback();
      return;
    }
    if (scope === 'category' && !categoryId) {
      setError('Pick a category to cap');
      errorFeedback();
      return;
    }

    try {
      if (editing && budget) {
        await update.mutateAsync({
          id: budget.id,
          patch: { amount: paise, warnAtPercent: warnAt },
        });
      } else {
        await create.mutateAsync(
          scope === 'overall'
            ? { scope: 'overall', amount: paise, warnAtPercent: warnAt }
            : { scope: 'category', categoryId: categoryId as string, amount: paise, warnAtPercent: warnAt },
        );
      }
      successFeedback();
      onClose();
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
    if (!budget) return;
    Alert.alert(
      'Remove this budget?',
      'Your transactions stay exactly as they are — only the cap goes.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            remove.mutate(budget.id, {
              onSuccess() {
                successFeedback();
                onClose();
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

  if (step === 'category') {
    return (
      <BottomSheet
        visible={visible}
        onClose={() => setStep('form')}
        title="Cap which category?"
        maxHeightRatio={0.9}
      >
        <CategoryList
          categories={available}
          selectedId={categoryId}
          onSelect={(picked) => {
            setCategoryId(picked.id);
            setStep('form');
          }}
        />
        <View style={{ height: theme.spacing.xl }} />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit budget' : 'New budget'}
      subtitle={editing && budget ? `${formatINR(budget.spent)} spent so far` : undefined}
      maxHeightRatio={0.92}
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
            label={editing ? 'Save budget' : 'Create budget'}
            onPress={() => void handleSubmit()}
            variant="brand"
            size="lg"
            fullWidth
            loading={saving}
          />
        </View>
      }
    >
      {editing || hasOverall ? null : (
        <SegmentedControl
          options={SCOPES}
          value={scope}
          onChange={(next) => {
            setScope(next);
            setError(undefined);
          }}
          accessibilityLabel="What the budget covers"
        />
      )}

      <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xl }}>
        <Text variant="caption" tone="tertiary" style={{ marginBottom: theme.spacing.xs }}>
          Monthly cap
        </Text>
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
            accessibilityLabel={`Cap ${formatAmountInput(amount)} rupees`}
          >
            {formatAmountInput(amount)}
          </Text>
        </View>
      </View>

      {scope === 'category' && !editing ? (
        <Pressable
          onPress={() => {
            tapFeedback();
            setStep('category');
          }}
          accessibilityRole="button"
          accessibilityLabel={`Category, ${category?.name ?? 'not chosen'}`}
          accessibilityHint="Opens the category picker"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            minHeight: 56,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.md,
            backgroundColor: pressed ? theme.colors.surfaceStrong : theme.colors.surfaceMuted,
          })}
        >
          <IconTile
            name={toIconName(category?.icon)}
            color={category ? categoryColor(category.color) : theme.colors.textTertiary}
            size="sm"
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="caption" tone="tertiary">
              Category
            </Text>
            <Text variant="labelSm" numberOfLines={1}>
              {category?.name ?? 'Pick one'}
            </Text>
          </View>
          <Icon name="chevronDown" size={14} color={theme.colors.textTertiary} />
        </Pressable>
      ) : null}

      {editing && budget?.categoryName ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            minHeight: 56,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceMuted,
          }}
        >
          <IconTile
            name={toIconName(budget.categoryIcon ?? 'circle')}
            color={categoryColor(budget.categoryColor ?? 'other')}
            size="sm"
          />
          <Text variant="labelSm" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
            {budget.categoryName}
          </Text>
        </View>
      ) : null}

      <Text
        variant="labelSm"
        tone="secondary"
        style={{ marginTop: theme.spacing.xl, marginBottom: theme.spacing.sm }}
      >
        Warn me at
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {WARN_OPTIONS.map((option) => {
          const active = option === warnAt;
          return (
            <Pressable
              key={option}
              onPress={() => {
                tapFeedback();
                setWarnAt(option);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Warn at ${option} percent`}
              accessibilityState={{ selected: active }}
              style={{
                flex: 1,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.md,
                backgroundColor: active ? theme.colors.brandSurface : theme.colors.surfaceMuted,
                borderWidth: theme.layout.hairline,
                borderColor: active ? theme.colors.brand : 'transparent',
              }}
            >
              <Text
                variant="labelSm"
                color={active ? theme.colors.brandText : theme.colors.textSecondary}
              >
                {`${option}%`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" tone="tertiary" style={{ marginTop: 6 }}>
        {paise > 0
          ? `One alert at ${formatINR(Math.round((paise * warnAt) / 100))}, and one if you go over.`
          : 'One alert on the way up, and one if you go over. Never more.'}
      </Text>

      <Keypad
        onKey={(key) => {
          setAmount((current) => applyAmountKey(current, key));
          if (error) setError(undefined);
        }}
        onLongBackspace={() => setAmount('')}
        style={{ marginTop: theme.spacing.lg }}
      />

      {editing ? (
        <Button
          label="Remove budget"
          variant="ghost"
          size="md"
          loading={remove.isPending}
          onPress={confirmDelete}
          style={{ alignSelf: 'center', marginTop: theme.spacing.md }}
        />
      ) : null}
    </BottomSheet>
  );
}

function CategoryList({
  categories,
  selectedId,
  onSelect,
}: {
  categories: Category[];
  selectedId?: string;
  onSelect: (category: Category) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const matching = needle
    ? categories.filter(
        (category) =>
          category.name.toLowerCase().includes(needle) ||
          category.group.toLowerCase().includes(needle),
      )
    : categories;

  return (
    <View>
      <Input
        placeholder="Search categories"
        value={query}
        onChangeText={setQuery}
        leftIcon="search"
        autoCorrect={false}
        autoCapitalize="none"
        containerStyle={{ marginBottom: theme.spacing.lg }}
      />

      {matching.length === 0 ? (
        <Text variant="bodySm" tone="tertiary" align="center" style={{ paddingVertical: theme.spacing.xxl }}>
          Every category matching that already has a budget.
        </Text>
      ) : (
        matching.map((category, index) => (
          <View key={category.id}>
            {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
            <Pressable
              onPress={() => {
                tapFeedback();
                onSelect(category);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${category.name}, ${category.group}`}
              accessibilityState={{ selected: category.id === selectedId }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                minHeight: 56,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radius.md,
                backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
              })}
            >
              <IconTile
                name={toIconName(category.icon)}
                color={categoryColor(category.color)}
                size="sm"
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="label" numberOfLines={1}>
                  {category.name}
                </Text>
                <Text variant="caption" tone="tertiary" numberOfLines={1}>
                  {category.group}
                </Text>
              </View>
              {category.id === selectedId ? (
                <Icon name="check" size={18} color={theme.colors.brandText} />
              ) : null}
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}
