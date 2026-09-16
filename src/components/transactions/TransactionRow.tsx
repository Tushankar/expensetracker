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
   * `detailed` is the Activity row: a merchant monogram, a category chip and a
   * disclosure chevron.
   */
  variant?: 'compact' | 'detailed';
  onPress?: (transaction: Transaction) => void;
};

/**
 * Below this, a labelled category chip and the timestamp cannot both fit, and the
 * timestamp is the one worth keeping — the chip still carries its colour and glyph.
 */
const CHIP_LABEL_MIN_WIDTH = 380;

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
export function TransactionRow({
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

  const label = `${title}, ${amount}, ${isTransfer ? 'transfer' : (category?.name ?? '')}, ${meta}`;

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: detailed ? theme.spacing.sm + 2 : theme.spacing.md,
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

      <Text
        variant="amountSm"
        tone={isIncome ? 'positive' : isTransfer ? 'secondary' : 'primary'}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {amount}
      </Text>

      {detailed ? <Icon name="chevronRight" size={14} color={theme.colors.textTertiary} /> : null}
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
}
