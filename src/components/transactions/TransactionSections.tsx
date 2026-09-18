import { memo } from 'react';
import { View } from 'react-native';

import type { Account, Category, Transaction } from '@/api/types';
import { Divider, GlassFill, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';

import { TransactionRow } from './TransactionRow';

export type TransactionSection = {
  label: string;
  /** Income minus expenses for the day. Transfers are in neither. */
  net: number;
  data: Transaction[];
};

/** Lines a divider up with the row text rather than its avatar. */
const DIVIDER_INSET = 40 + 10;

/**
 * Groups a page of transactions under day headings.
 *
 * The list arrives newest-first from the API, so consecutive items with the same
 * day label are already adjacent and one pass is enough — no sorting, no map of
 * arrays. That matters because this runs again on every page appended.
 *
 * Transfers are excluded from each day's net for the same reason they are
 * excluded from the month's: ₹10,000 moving from HDFC to Cash did not change what
 * you have, and a heading reading −₹10,000 would be wrong in a way that
 * undermines every other number on the screen.
 */
export function buildTransactionSections(transactions: Transaction[]): TransactionSection[] {
  const sections: TransactionSection[] = [];

  for (const transaction of transactions) {
    const label = formatDayLabel(transaction.date);
    const last = sections[sections.length - 1];

    const section =
      last && last.label === label ? last : { label, net: 0, data: [] as Transaction[] };
    if (section !== last) sections.push(section);

    section.data.push(transaction);

    if (transaction.type === 'income') section.net += transaction.amount;
    else if (transaction.type === 'expense') section.net -= transaction.amount;
  }

  return sections;
}

export function TransactionSectionHeader({ label, net }: { label: string; net: number }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        paddingTop: theme.spacing.xl,
        paddingBottom: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xs,
        overflow: 'hidden',
      }}
    >
      {/* A whole day of rows slides under this header, so it has to be the one
          thing on the screen you cannot see through — hence chrome, the same
          material as the tab bar, and for the same reason. No rim: it spans the
          list and a boxed hairline would read as a card. */}
      <GlassFill tone="chrome" radius={0} rim={false} />

      <Text variant="overline" tone="tertiary">
        {label}
      </Text>
      {net === 0 ? null : (
        <Text variant="caption" tone="tertiary">
          {formatINR(net, { signed: true, negative: net < 0 })}
        </Text>
      )}
    </View>
  );
}

export type TransactionListItemProps = {
  transaction: Transaction;
  category?: Category;
  account?: Account;
  destinationAccount?: Account;
  /** Rounds the top corners and drops the leading divider. */
  first: boolean;
  /** Rounds the bottom corners. */
  last: boolean;
  onPress: (transaction: Transaction) => void;
};

/**
 * One row, with the card edges a grouped list needs.
 *
 * The day groups used to be one `Card` wrapping every row, which cannot survive
 * virtualisation — a `SectionList` renders items independently and has no place
 * to put a container around them. So the card is drawn by its first and last
 * rows instead, which looks identical and costs nothing.
 *
 * Memoised because this is the most-rendered component in the app by a wide
 * margin: a scroll through six months of spending mounts hundreds of these, and
 * every parent state change would otherwise re-render all of them.
 */
export const TransactionListItem = memo(function TransactionListItem({
  transaction,
  category,
  account,
  destinationAccount,
  first,
  last,
  onPress,
}: TransactionListItemProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        // Painted rather than a `GlassSurface`: the row is one slice of a card
        // whose top and bottom live in different list items, so it takes the
        // translucent surface token and leaves the corners to the ends.
        backgroundColor: theme.colors.surface,
        borderLeftWidth: theme.layout.hairline,
        borderRightWidth: theme.layout.hairline,
        borderColor: theme.colors.border,
        borderTopWidth: first ? theme.layout.hairline : 0,
        borderBottomWidth: last ? theme.layout.hairline : 0,
        borderTopLeftRadius: first ? theme.radius.lg : 0,
        borderTopRightRadius: first ? theme.radius.lg : 0,
        borderBottomLeftRadius: last ? theme.radius.lg : 0,
        borderBottomRightRadius: last ? theme.radius.lg : 0,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: first ? theme.spacing.xs : 0,
        paddingBottom: last ? theme.spacing.xs : 0,
      }}
    >
      {first ? null : <Divider inset={DIVIDER_INSET} />}
      <TransactionRow
        transaction={transaction}
        variant="detailed"
        category={category}
        account={account}
        destinationAccount={destinationAccount}
        onPress={onPress}
      />
    </View>
  );
});
