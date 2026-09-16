import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  CategoryChip,
  Icon,
  IconTile,
  MerchantAvatar,
  Text,
  usePressAnimation,
} from '@/components/ui';
import { merchantDomain } from '@/data/merchants';
import { getCategory } from '@/data/mock';
import { categoryColor, useTheme } from '@/theme';
import type { PaymentMethod, Transaction } from '@/types/models';
import { formatINR } from '@/utils/currency';
import { formatTime } from '@/utils/date';
import { tapFeedback } from '@/utils/haptics';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  upi: 'UPI',
  card: 'Card',
  cash: 'Cash',
  netbanking: 'Net banking',
  autopay: 'Autopay',
};

export type TransactionItemProps = {
  transaction: Transaction;
  /**
   * `compact` is the Home summary row: a category tile, no chip, no chevron.
   * `detailed` is the Activity row: a merchant monogram, a category chip and a
   * disclosure chevron.
   */
  variant?: 'compact' | 'detailed';
  onPress?: (transaction: Transaction) => void;
};

/**
 * One transaction row.
 *
 * Only income is coloured. Painting every expense red turns a normal month into a
 * wall of alarm, so outgoing amounts stay in primary text and the minus sign does
 * the work.
 */
/**
 * Below this, a labelled category chip and the timestamp cannot both fit, and the
 * timestamp is the one worth keeping — the chip still carries its colour and glyph.
 */
const CHIP_LABEL_MIN_WIDTH = 380;

export function TransactionItem({
  transaction,
  variant = 'compact',
  onPress,
}: TransactionItemProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(theme.pressScale.card);

  const category = getCategory(transaction.categoryId);
  const accent = categoryColor(category.hue);
  const isIncome = transaction.kind === 'income';
  const detailed = variant === 'detailed';

  const amount = formatINR(transaction.amount, { signed: true, negative: !isIncome });
  const method = METHOD_LABEL[transaction.method];
  const time = formatTime(transaction.occurredAt);

  // The detailed row carries the category in its chip, so repeating it in the meta
  // line would only cost the room the timestamp needs.
  const meta = detailed
    ? `${method}  ·  ${time}`
    : [category.label, method, time].filter(Boolean).join('  ·  ');

  const label = `${transaction.merchant}, ${amount}, ${category.label}, ${method}, ${time}`;

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
      {detailed ? (
        <MerchantAvatar
          name={transaction.merchant}
          domain={merchantDomain(transaction.merchant)}
          size={40}
        />
      ) : (
        <IconTile name={category.icon} color={accent} />
      )}

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
            {transaction.merchant}
          </Text>
          {transaction.recurring ? (
            <Icon name="repeat" size={13} color={theme.colors.textTertiary} strokeWidth={2.2} />
          ) : null}
        </View>
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {meta}
        </Text>
      </View>

      {detailed ? (
        <CategoryChip
          label={category.label}
          icon={category.icon}
          color={accent}
          iconOnly={width < CHIP_LABEL_MIN_WIDTH}
        />
      ) : null}

      <Text
        variant="amountSm"
        tone={isIncome ? 'positive' : 'primary'}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {amount}
      </Text>

      {detailed ? (
        <Icon name="chevronRight" size={14} color={theme.colors.textTertiary} />
      ) : null}
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
