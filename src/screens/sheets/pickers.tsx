import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { Account, Category, PaymentMethod } from '@/api/types';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '@/api/types';
import { toIconName } from '@/components/icons/registry';
import {
  Badge,
  Calendar,
  Divider,
  EmptyState,
  Icon,
  IconTile,
  Input,
  Text,
} from '@/components/ui';
import { categoryColor, useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

/**
 * The panels the entry sheet swaps to when a picker row is tapped.
 *
 * They render *inside* the existing sheet rather than opening a second one. Two
 * stacked native modals is a well-known source of Android flicker and iOS
 * dismissal bugs, and swapping the body is also simply faster: no second entry
 * animation, no re-measure, and the amount stays on screen behind the header so
 * you never lose track of what you are categorising.
 */

type RowProps = {
  label: string;
  sublabel?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  selected?: boolean;
  onPress: () => void;
};

function PickerRow({ label, sublabel, leading, trailing, selected, onPress }: RowProps) {
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
        minHeight: 56,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
      })}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="label" numberOfLines={1}>
          {label}
        </Text>
        {sublabel ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {trailing}
      {selected ? <Icon name="check" size={18} color={theme.colors.brandText} /> : null}
    </Pressable>
  );
}

// ------------------------------------------------------------------ categories

export type CategoryPickerProps = {
  categories: Category[];
  selectedId?: string;
  onSelect: (category: Category) => void;
};

export function CategoryPicker({ categories, selectedId, onSelect }: CategoryPickerProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? categories.filter(
          (category) =>
            category.name.toLowerCase().includes(needle) ||
            category.group.toLowerCase().includes(needle),
        )
      : categories;

    // Preserves the seeded order, which puts Food first and Income last rather
    // than opening on "Activities".
    const byGroup = new Map<string, Category[]>();
    for (const category of matching) {
      const bucket = byGroup.get(category.group);
      if (bucket) bucket.push(category);
      else byGroup.set(category.group, [category]);
    }
    return [...byGroup.entries()];
  }, [categories, query]);

  return (
    <View>
      <Input
        placeholder="Search categories"
        value={query}
        onChangeText={setQuery}
        leftIcon="search"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        containerStyle={{ marginBottom: theme.spacing.lg }}
      />

      {groups.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matches"
          description={`Nothing here is called "${query.trim()}". Try a shorter search.`}
        />
      ) : (
        groups.map(([group, items]) => (
          <View key={group} style={{ marginBottom: theme.spacing.lg }}>
            <Text variant="overline" tone="tertiary" style={{ marginBottom: 6, paddingHorizontal: theme.spacing.sm }}>
              {group}
            </Text>
            {items.map((category) => (
              <PickerRow
                key={category.id}
                label={category.name}
                selected={category.id === selectedId}
                leading={
                  <IconTile
                    name={toIconName(category.icon)}
                    color={categoryColor(category.color)}
                    size="sm"
                  />
                }
                onPress={() => onSelect(category)}
              />
            ))}
          </View>
        ))
      )}
    </View>
  );
}

// -------------------------------------------------------------------- accounts

export type AccountPickerProps = {
  accounts: Account[];
  selectedId?: string;
  /** Hidden from the list — the other side of a transfer cannot also be this side. */
  excludeId?: string;
  onSelect: (account: Account) => void;
};

export function AccountPicker({ accounts, selectedId, excludeId, onSelect }: AccountPickerProps) {
  const theme = useTheme();
  const list = accounts.filter((account) => account.id !== excludeId);

  if (list.length === 0) {
    return (
      <EmptyState
        icon="wallet"
        title="No other account"
        description="A transfer needs somewhere to go. Add a second account from the Accounts tab."
      />
    );
  }

  return (
    <View>
      {list.map((account, index) => (
        <View key={account.id}>
          {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
          <PickerRow
            label={account.name}
            sublabel={
              account.institution && account.last4
                ? `${account.institution} ·· ${account.last4}`
                : (account.institution ?? account.last4 ?? undefined)
            }
            selected={account.id === selectedId}
            leading={<IconTile name={toIconName(account.icon)} color={account.color} size="sm" />}
            trailing={
              <Text
                variant="labelSm"
                tone={account.balance < 0 ? 'negative' : 'secondary'}
                numberOfLines={1}
              >
                {formatINR(account.balance)}
              </Text>
            }
            onPress={() => onSelect(account)}
          />
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------- payment methods

export type MethodPickerProps = {
  selected: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
};

const METHOD_ICON: Record<PaymentMethod, string> = {
  upi: 'upi',
  cash: 'cash',
  credit_card: 'card',
  debit_card: 'card',
  net_banking: 'bank',
  bank_transfer: 'repeat',
  wallet: 'wallet',
  other: 'circle',
};

export function MethodPicker({ selected, onSelect }: MethodPickerProps) {
  const theme = useTheme();

  return (
    <View>
      {PAYMENT_METHODS.map((method, index) => (
        <View key={method}>
          {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
          <PickerRow
            label={PAYMENT_METHOD_LABEL[method]}
            selected={method === selected}
            leading={
              <IconTile
                name={toIconName(METHOD_ICON[method])}
                color={theme.colors.textTertiary}
                size="sm"
              />
            }
            onPress={() => onSelect(method)}
          />
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ date panel

export type DatePickerProps = {
  value: Date;
  onSelect: (date: Date) => void;
};

export function DatePicker({ value, onSelect }: DatePickerProps) {
  const theme = useTheme();

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const quick = [
    { label: 'Today', date: today },
    { label: 'Yesterday', date: yesterday },
  ];

  return (
    <View>
      {/* Most transactions are entered the day they happen, or the morning after.
          Two taps should cover both without touching the grid. */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.xl }}>
        {quick.map((option) => {
          const active =
            option.date.toDateString() === value.toDateString();
          return (
            <Pressable
              key={option.label}
              onPress={() => {
                tapFeedback();
                onSelect(option.date);
              }}
              accessibilityRole="button"
              accessibilityLabel={option.label}
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
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Calendar value={value} onChange={onSelect} />
    </View>
  );
}

/** Small helper used by the entry sheet's summary line. */
export function SelectionBadge({ label, tone }: { label: string; tone?: 'brand' | 'neutral' }) {
  return <Badge label={label} tone={tone ?? 'neutral'} />;
}
