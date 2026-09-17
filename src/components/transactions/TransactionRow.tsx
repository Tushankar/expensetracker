import { memo } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PAYMENT_METHOD_LABEL, type Account, type Category, type Transaction } from '@/api/types';
import { toIconName } from '@/components/icons/registry';
import {
  CategoryChip,
  Icon,
  IconTile,
  MerchantAvatar,
  Text,
  usePressAnimation,
} from '@/components/ui';
import { merchantDomain } from '@/data/merchants';
import { categoryColor, useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { formatTime } from '@/utils/date';
import { tapFeedback } from '@/utils/haptics';

export type TransactionRowProps = {
  transaction: Transaction;
  category?: Category;
  account?: Account;
  destinationAccount?: Account;
  /**
   * `compact` is the Home summary row: a category tile, no chip, no chevron.
   * `detailed` is the Activity row: a merchant monogram, a category chip, and a
   * disclosure chevron where the width allows one.
   */
  variant?: 'compact' | 'detailed';
  onPress?: (transaction: Transaction) => void;
};

/**
 * Below this, a labelled category chip and the timestamp cannot both fit, and the
 * timestamp is the one worth keeping — the chip still carries its colour and glyph.
 *
 * Measured rather than guessed: on a 390dp screen a labelled chip leaves the
 * merchant column 108dp, which truncates "Credit Card  ·  9:05 am" to
 * "Credit Card  ·  9:0…". Icon-only returns ~38dp of that to the name and the
 * time, which are the two things the row exists to say. The threshold clears
 * every current phone — a labelled chip is for tablets and the web build.
 */
const CHIP_LABEL_MIN_WIDTH = 430;

/**
 * Below this, the disclosure chevron is dropped from the detailed row.
 *
 * On a 360dp Android — the width a large share of this app's phones actually
 * are — the chevron and its gap cost 18dp the merchant column does not have,
 * and "Credit Card  ·  9:05 am" truncates again. It is the cheapest 18dp in the
 * row: the row is a pressable card that animates on press and already carries
 * "Opens transaction details" as its accessibility hint, so the chevron repeats
 * what three other things already say. Where there is room it stays.
 */
const CHEVRON_MIN_WIDTH = 380;

/**
 * Holds the amount column steady so the category tiles beside it line up.
 *
 * Measured, because the first guess at this cost more than it bought: an 86dp
 * column took 26dp off the merchant text and put the timestamp truncation
 * straight back. A signed seven-figure total ("+₹1,57,000") renders at ~64dp,
 * and a four-figure one at ~47dp, so this aligns every realistic amount while
 * leaving the text column 145dp — past the 134dp the longest method-and-time
 * line needs.
 */
const AMOUNT_COLUMN_WIDTH = 66;

/**
 * One transaction row.
 *
 * Only income is coloured. Painting every expense red turns a normal month into a
 * wall of alarm, so outgoing amounts stay in primary text and the minus sign does
 * the work.
 *
 * A transfer gets neither sign and neither colour, because it is neither: the
 * money is still yours, it just moved. Showing "−₹10,000" for an ATM withdrawal
 * would be the row contradicting the totals above it.
 */
export const TransactionRow = memo(function TransactionRow({
  transaction,
  category,
  account,
  destinationAccount,
  variant = 'compact',
  onPress,
}: TransactionRowProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(theme.pressScale.card);

  const detailed = variant === 'detailed';
  const showChevron = detailed && width >= CHEVRON_MIN_WIDTH;
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer';

  const accent = isTransfer
    ? theme.colors.textTertiary
    : categoryColor(category?.color ?? 'other');

  // A transaction with no merchant falls back to its category, which is what the
  // fast entry path produces and is still a perfectly readable row.
  const title = transaction.merchant || (isTransfer ? 'Transfer' : (category?.name ?? 'Transaction'));

  const amount = isTransfer
    ? formatINR(transaction.amount)
    : formatINR(transaction.amount, { signed: true, negative: !isIncome });

  const method = PAYMENT_METHOD_LABEL[transaction.paymentMethod];
  const time = formatTime(transaction.date);

  const meta = isTransfer
    ? [account?.name, destinationAccount?.name].filter(Boolean).join('  →  ') || method
    : detailed
      ? `${method}  ·  ${time}`
      : [category?.name, method, time].filter(Boolean).join('  ·  ');

  // Joined from the parts that exist. Interpolating a missing category straight
  // into the template leaves ", ," in the middle, which a screen reader reads as
  // a pause into nothing.
  const label = [title, amount, isTransfer ? 'transfer' : category?.name, meta]
    .filter(Boolean)
    .join(', ');

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        // 8 rather than 10 on the detailed row: three gaps across it, so the
        // 6dp is the difference between "Net Banking  ·  10:00 am" fitting on a
        // 360dp Android and losing its last two characters.
        gap: detailed ? theme.spacing.sm : theme.spacing.md,
        minHeight: detailed ? 72 : 64,
        paddingVertical: theme.spacing.md,
      }}
    >
      {detailed && !isTransfer ? (
        <MerchantAvatar name={title} domain={merchantDomain(title)} size={40} />
      ) : (
        <IconTile
          name={isTransfer ? 'repeat' : toIconName(category?.icon)}
          color={accent}
          size={detailed ? 'sm' : 'md'}
          style={detailed ? { width: 40, height: 40 } : undefined}
        />
      )}

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {meta}
        </Text>
      </View>

      {detailed && !isTransfer && category ? (
        <CategoryChip
          label={category.name}
          icon={toIconName(category.icon)}
          color={accent}
          iconOnly={width < CHIP_LABEL_MIN_WIDTH}
        />
      ) : null}

      {/* The amount and its disclosure chevron read as one right-hand unit, so
          they sit closer to each other than to the category chip. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <Text
          variant="amountSm"
          tone={isIncome ? 'positive' : isTransfer ? 'secondary' : 'primary'}
          numberOfLines={1}
          align="right"
          maxFontSizeMultiplier={1.3}
          // A ledger column, so the figures line up on their last digit and the
          // category tiles beside them stop wandering left and right with the
          // width of the number. Wide enough for "−₹1,57,000"; anything longer
          // still grows the column rather than being cut.
          style={detailed ? { minWidth: AMOUNT_COLUMN_WIDTH } : undefined}
        >
          {amount}
        </Text>

        {showChevron ? (
          <Icon name="chevronRight" size={14} color={theme.colors.textTertiary} />
        ) : null}
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress(transaction);
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens transaction details"
    >
      <Animated.View style={animatedStyle}>{content}</Animated.View>
    </Pressable>
  );
})
