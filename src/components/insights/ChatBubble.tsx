import { Fragment } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { AiAnswerContext, AiChatMessage } from '@/api/types';
import { Badge, Divider, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';

export type ChatBubbleProps = {
  message: AiChatMessage;
};

/** Wide enough to read, narrow enough that the two sides are never confused. */
const MAX_WIDTH = '88%';

/**
 * One turn of the conversation.
 *
 * The assistant's bubble carries its working underneath it — the period it looked
 * at, the category it matched, the total it read and, where the question was about
 * particular transactions, those transactions. That strip is not decoration: it is
 * the difference between an answer you can check and an answer you have to trust.
 * Everything in it was computed from the database before the model saw a word of
 * it, so the receipt and the sentence above it come from the same place.
 */
export function ChatBubble({ message }: ChatBubbleProps) {
  const theme = useTheme();
  const mine = message.role === 'user';

  if (mine) {
    return (
      <Animated.View
        entering={FadeInDown.duration(theme.duration.fast)}
        style={{ alignSelf: 'flex-end', maxWidth: MAX_WIDTH }}
      >
        <View
          accessible
          accessibilityLabel={`You asked: ${message.text}`}
          style={{
            backgroundColor: theme.colors.brandSurface,
            borderRadius: theme.radius.md,
            borderBottomRightRadius: theme.radius.xs,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
          }}
        >
          <Text variant="body" color={theme.colors.brandText}>
            {message.text}
          </Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(theme.duration.base)}
      style={{ alignSelf: 'flex-start', maxWidth: MAX_WIDTH, gap: theme.spacing.sm }}
    >
      <View
        accessible
        accessibilityLabel={message.text}
        style={{
          backgroundColor: theme.colors.surface,
          borderWidth: theme.layout.hairline,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          borderBottomLeftRadius: theme.radius.xs,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        <Text variant="body" style={{ lineHeight: 23 }}>
          {message.text}
        </Text>

        <Working context={message.context} />

        {message.limitedData ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Icon name="info" size={13} color={theme.colors.warning} />
            <Text variant="caption" color={theme.colors.warning} style={{ flex: 1, minWidth: 0 }}>
              Very little recorded for this period, so treat it as a sketch.
            </Text>
          </View>
        ) : null}
      </View>

      {/* Said out loud rather than hidden. The figures are identical either way,
          and quietly passing off computed wording as the assistant is the kind of
          small dishonesty that costs trust in every other number on the screen. */}
      {!message.fromModel ? <Badge label="Computed" tone="neutral" /> : null}
    </Animated.View>
  );
}

/**
 * The receipt: what the server actually looked up to produce the sentence above.
 *
 * Rendered only when there is something concrete to show. An answer with no
 * retrieved figures — "where should I invest?", which is declined — gets no strip,
 * because inventing a source for a sentence that has none would be worse than
 * showing nothing.
 */
function Working({ context }: { context: AiAnswerContext }) {
  const theme = useTheme();

  const hasAmount = typeof context.amount === 'number';
  const rows = context.transactions ?? [];
  if (!hasAmount && rows.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
      <Divider />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <Icon name="checkCircle" size={13} color={theme.colors.textTertiary} />
        <Text variant="caption" tone="tertiary" style={{ flex: 1, minWidth: 0 }}>
          {[
            context.categoryName,
            hasAmount ? formatINR(context.amount ?? 0) : null,
            typeof context.count === 'number'
              ? `${context.count} ${context.count === 1 ? 'transaction' : 'transactions'}`
              : null,
            context.periodLabel,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
      </View>

      {rows.length > 0 ? (
        <View style={{ gap: 6 }}>
          {rows.map((row, index) => (
            <Fragment key={row.id}>
              {index > 0 ? <Divider /> : null}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}
              >
                <Text
                  variant="caption"
                  tone="secondary"
                  numberOfLines={1}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {row.merchant}
                </Text>
                <Text variant="caption" tone="tertiary" numberOfLines={1}>
                  {formatDayLabel(row.date)}
                </Text>
                <Text variant="caption" numberOfLines={1}>
                  {formatINR(row.amount)}
                </Text>
              </View>
            </Fragment>
          ))}
        </View>
      ) : null}
    </View>
  );
}
