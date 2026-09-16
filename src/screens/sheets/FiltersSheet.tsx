import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAccounts, useCategories, type PaymentMethod } from '@/api';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '@/api/types';
import { toIconName } from '@/components/icons/registry';
import {
  BottomSheet,
  Button,
  Divider,
  Icon,
  IconTile,
  Input,
  SegmentedControl,
  Text,
  type SegmentOption,
} from '@/components/ui';
import { categoryColor, useTheme } from '@/theme';
import { RUPEE, paiseToRupeeInput, rupeesToPaise } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

export type Filters = {
  accountId?: string;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
  /** Integer paise. */
  minAmount?: number;
  maxAmount?: number;
  sort?: '-date' | 'date' | '-amount' | 'amount';
};

const SORTS: readonly SegmentOption<NonNullable<Filters['sort']>>[] = [
  { value: '-date', label: 'Newest' },
  { value: 'date', label: 'Oldest' },
  { value: '-amount', label: 'Largest' },
  { value: 'amount', label: 'Smallest' },
];

export type FiltersSheetProps = {
  visible: boolean;
  value: Filters;
  onClose: () => void;
  onApply: (filters: Filters) => void;
};

/**
 * The Activity filter sheet.
 *
 * It edits a local copy and only reports back on Apply. Filtering live as each
 * control is touched would fire a query per tap and make the list flicker through
 * three intermediate states on the way to the one the user wanted.
 */
export function FiltersSheet({ visible, value, onClose, onApply }: FiltersSheetProps) {
  const theme = useTheme();

  // Seeded once per open — the caller's `key` changes each time the sheet is
  // shown, so there is no effect copying `value` into state on every render.
  const [draft, setDraft] = useState<Filters>(value);
  const [minText, setMinText] = useState(() =>
    value.minAmount === undefined ? '' : paiseToRupeeInput(value.minAmount),
  );
  const [maxText, setMaxText] = useState(() =>
    value.maxAmount === undefined ? '' : paiseToRupeeInput(value.maxAmount),
  );

  const accountsQuery = useAccounts();
  const categoriesQuery = useCategories();

  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data?.categories ?? [];

  function apply() {
    const min = minText.trim() ? rupeesToPaise(minText) : undefined;
    const max = maxText.trim() ? rupeesToPaise(maxText) : undefined;

    onApply({
      ...draft,
      minAmount: min,
      // A range typed backwards is a slip, not a request for zero results.
      maxAmount: max !== undefined && min !== undefined && max < min ? min : max,
    });
  }

  function reset() {
    setDraft({});
    setMinText('');
    setMaxText('');
  }

  const selectedAccount = accounts.find((account) => account.id === draft.accountId);
  const selectedCategory = categories.find((category) => category.id === draft.categoryId);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      subtitle="Narrow the list down"
      maxHeightRatio={0.92}
      footer={
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <Button label="Reset" onPress={reset} variant="secondary" size="lg" style={{ flex: 1 }} />
          <Button label="Apply" onPress={apply} variant="brand" size="lg" style={{ flex: 1.4 }} />
        </View>
      }
    >
      <Text variant="labelSm" tone="secondary" style={{ marginBottom: theme.spacing.sm }}>
        Sort by
      </Text>
      <SegmentedControl
        options={SORTS}
        value={draft.sort ?? '-date'}
        onChange={(sort) => setDraft((current) => ({ ...current, sort }))}
        accessibilityLabel="Sort order"
      />

      <Text
        variant="labelSm"
        tone="secondary"
        style={{ marginTop: theme.spacing.xxl, marginBottom: theme.spacing.sm }}
      >
        Amount range
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Input
          placeholder="Min"
          prefix={RUPEE}
          value={minText}
          onChangeText={setMinText}
          keyboardType="decimal-pad"
          containerStyle={{ flex: 1 }}
        />
        <Input
          placeholder="Max"
          prefix={RUPEE}
          value={maxText}
          onChangeText={setMaxText}
          keyboardType="decimal-pad"
          containerStyle={{ flex: 1 }}
        />
      </View>

      <FilterSection title="Account">
        <OptionRow
          label="Any account"
          selected={!draft.accountId}
          onPress={() => setDraft((current) => ({ ...current, accountId: undefined }))}
        />
        {accounts.map((account) => (
          <OptionRow
            key={account.id}
            label={account.name}
            selected={draft.accountId === account.id}
            leading={<IconTile name={toIconName(account.icon)} color={account.color} size="sm" />}
            onPress={() =>
              setDraft((current) => ({
                ...current,
                accountId: current.accountId === account.id ? undefined : account.id,
              }))
            }
          />
        ))}
      </FilterSection>

      <FilterSection title="Payment method">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <MethodChip
            label="Any"
            active={!draft.paymentMethod}
            onPress={() => setDraft((current) => ({ ...current, paymentMethod: undefined }))}
          />
          {PAYMENT_METHODS.map((method) => (
            <MethodChip
              key={method}
              label={PAYMENT_METHOD_LABEL[method]}
              active={draft.paymentMethod === method}
              onPress={() =>
                setDraft((current) => ({
                  ...current,
                  paymentMethod: current.paymentMethod === method ? undefined : method,
                }))
              }
            />
          ))}
        </View>
      </FilterSection>

      {/* One category at a time. A multi-select here would need its own apply
          affordance and a chip row to show the selection, which is more machinery
          than a personal ledger earns. */}
      <FilterSection title="Category">
        <OptionRow
          label="Any category"
          selected={!draft.categoryId}
          onPress={() => setDraft((current) => ({ ...current, categoryId: undefined }))}
        />
        {selectedCategory ? (
          <OptionRow
            label={selectedCategory.name}
            sublabel={selectedCategory.group}
            selected
            leading={
              <IconTile
                name={toIconName(selectedCategory.icon)}
                color={categoryColor(selectedCategory.color)}
                size="sm"
              />
            }
            onPress={() => setDraft((current) => ({ ...current, categoryId: undefined }))}
          />
        ) : null}
        <CategoryQuickList
          categories={categories.filter((category) => category.id !== draft.categoryId)}
          onSelect={(id) => setDraft((current) => ({ ...current, categoryId: id }))}
        />
      </FilterSection>

      <View style={{ height: theme.spacing.lg }} />

      {selectedAccount || selectedCategory || draft.paymentMethod ? (
        <Text variant="caption" tone="tertiary" align="center">
          Filters apply to the list below, not to the period summary.
        </Text>
      ) : null}
    </BottomSheet>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginTop: theme.spacing.xxl }}>
      <Text variant="labelSm" tone="secondary" style={{ marginBottom: theme.spacing.sm }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

type OptionRowProps = {
  label: string;
  sublabel?: string;
  selected: boolean;
  leading?: React.ReactNode;
  onPress: () => void;
};

function OptionRow({ label, sublabel, selected, leading, onPress }: OptionRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={sublabel ? `${label}, ${sublabel}` : label}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: 52,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
      })}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodySm" numberOfLines={1}>
          {label}
        </Text>
        {sublabel ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={17} color={theme.colors.brandText} /> : null}
    </Pressable>
  );
}

function MethodChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
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
      hitSlop={{ top: 6, bottom: 6 }}
      style={{
        height: 36,
        paddingHorizontal: theme.spacing.md,
        justifyContent: 'center',
        borderRadius: theme.radius.pill,
        backgroundColor: active ? theme.colors.brandSurface : theme.colors.surfaceMuted,
        borderWidth: theme.layout.hairline,
        borderColor: active ? theme.colors.brand : 'transparent',
      }}
    >
      <Text
        variant="caption"
        color={active ? theme.colors.brandText : theme.colors.textSecondary}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The first few categories of each group, so the common case is reachable without
 * scrolling a hundred rows inside a sheet that already scrolls.
 */
function CategoryQuickList({
  categories,
  onSelect,
}: {
  categories: { id: string; name: string; group: string; icon: string; color: string }[];
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? categories : categories.slice(0, 8);

  return (
    <View>
      {visible.map((category, index) => (
        <View key={category.id}>
          {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
          <OptionRow
            label={category.name}
            sublabel={category.group}
            selected={false}
            leading={
              <IconTile
                name={toIconName(category.icon)}
                color={categoryColor(category.color)}
                size="sm"
              />
            }
            onPress={() => onSelect(category.id)}
          />
        </View>
      ))}

      {categories.length > 8 ? (
        <Button
          label={expanded ? 'Show fewer' : `Show all ${categories.length}`}
          variant="ghost"
          size="sm"
          onPress={() => setExpanded((current) => !current)}
          style={{ marginTop: theme.spacing.sm }}
        />
      ) : null}
    </View>
  );
}
