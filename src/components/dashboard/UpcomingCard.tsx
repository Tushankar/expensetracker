import { Fragment, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { RecurringRule } from '@/api/types';
import { Card, Divider, Icon, IconTile, SectionHeader, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

export type UpcomingCardProps = {
  rules: RecurringRule[];
  onSeeAll: () => void;
  onPress: (rule: RecurringRule) => void;
};

/**
 * What is about to leave the account.
 *
 * The most actionable block on the dashboard: every other card describes what
 * already happened, and this one is the only thing a person can still do
 * something about. It is also the reason it stays short — three rows is a
 * heads-up, ten is a second ledger.
 */
export function UpcomingCard({ rules, onSeeAll, onPress }: UpcomingCardProps) {
  const theme = useTheme();
  /**
   * One clock reading for the whole card, taken when it mounts.
   *
   * Reading `Date.now()` per row during render makes the output depend on when
   * React happened to re-render — two rows could disagree about what "tomorrow"
   * means — which is exactly what the compiler's purity rule is for.
   */
  const [now] = useState(() => Date.now());

  if (rules.length === 0) return null;

  return (
    <View>
      <SectionHeader title="Coming up" actionLabel="Manage" onActionPress={onSeeAll} />
      <Card padding={0} radius="lg">
        <View style={{ paddingHorizontal: theme.spacing.lg }}>
          {rules.map((rule, index) => (
            <Fragment key={rule.id}>
              {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
              <UpcomingRow rule={rule} now={now} onPress={onPress} />
            </Fragment>
          ))}
        </View>
      </Card>
    </View>
  );
}

function UpcomingRow({
  rule,
  now,
  onPress,
}: {
  rule: RecurringRule;
  now: number;
  onPress: (rule: RecurringRule) => void;
}) {
  const theme = useTheme();
  const due = rule.nextRunAt ? new Date(rule.nextRunAt) : null;
  const when = due ? relativeDay(due, new Date(now)) : '';

  // Anything inside the next two days is worth a colour; beyond that it is just
  // information and should not compete with a budget that is actually over.
  const soon = due ? due.getTime() - now < 2 * 86_400_000 : false;
  const isIncome = rule.type === 'income';

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress(rule);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${rule.name}, ${formatINR(rule.amount)}, ${when}`}
      accessibilityHint="Opens this recurring transaction"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: 60,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <IconTile
        name={rule.autoCreate ? 'repeat' : 'bell'}
        color={soon ? theme.colors.warning : theme.colors.textTertiary}
        size="sm"
      />

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="label" numberOfLines={1}>
          {rule.name}
        </Text>
        <Text
          variant="caption"
          color={soon ? theme.colors.warning : theme.colors.textTertiary}
          numberOfLines={1}
        >
          {rule.autoCreate ? when : `${when} · reminder only`}
        </Text>
      </View>

      <Text variant="labelSm" tone={isIncome ? 'positive' : 'primary'} numberOfLines={1}>
        {isIncome ? formatINR(rule.amount, { signed: true }) : formatINR(rule.amount)}
      </Text>
      <Icon name="chevronRight" size={14} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

/**
 * "Today", "Tomorrow", "In 4 days", then a date.
 *
 * Counted in whole local days rather than hours, so something due at 9am
 * tomorrow reads as "Tomorrow" at 10pm tonight instead of "In 11 hours".
 */
export function relativeDay(date: Date, now: Date = new Date()): string {
  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(now)) / 86_400_000);

  if (days <= 0) return 'Due now';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `In ${days} days`;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()] ?? ''}`;
}
