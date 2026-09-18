import { useNavigation } from '@react-navigation/native';
import { Fragment, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import {
  useAccountMap,
  useCategoryMap,
  usePauseRecurring,
  useRecurring,
  type RecurringRule,
} from '@/api';
import { QueryState } from '@/components/data/QueryState';
import { relativeDay } from '@/components/dashboard';
import { toIconName } from '@/components/icons/registry';
import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  IconButton,
  IconTile,
  PageHeader,
  Screen,
  SkeletonRow,
  Text,
} from '@/components/ui';
import { categoryColor, useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

/**
 * Standing instructions: rent, Netflix, the gym, an EMI, a salary credit.
 *
 * Grouped as active and paused rather than sorted into one list, because "is this
 * still running" is the question people come here to answer — a paused gym
 * membership buried between two live rules is exactly the thing that gets
 * forgotten about for six months.
 */
export function RecurringScreen() {
  const theme = useTheme();
  const navigation = useNavigation();

  // One clock reading per mount; see the note in UpcomingCard.
  const [now] = useState(() => new Date());
  const [showFinished, setShowFinished] = useState(false);
  const query = useRecurring(showFinished);
  const categories = useCategoryMap();
  const accounts = useAccountMap();
  const pause = usePauseRecurring();

  const rules = query.data ?? [];
  const live = rules.filter((rule) => rule.isActive && !rule.isPaused);
  const paused = rules.filter((rule) => rule.isActive && rule.isPaused);
  const finished = rules.filter((rule) => !rule.isActive);

  const monthlyOutgoing = live
    .filter((rule) => rule.type !== 'income' && rule.unit === 'month' && rule.interval === 1)
    .reduce((total, rule) => total + rule.amount, 0);

  function open(rule: RecurringRule) {
    navigation.navigate('RecurringForm', { id: rule.id });
  }

  function togglePause(rule: RecurringRule) {
    pause.mutate({ id: rule.id, paused: !rule.isPaused });
  }

  return (
    <Screen
      topInset={false}
      bottomInset={theme.spacing.xxl}
      testID="recurring-screen"
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={theme.colors.textTertiary}
          colors={[theme.colors.brand]}
          progressBackgroundColor={theme.colors.surface}
        />
      }
    >
      <PageHeader
        title="Recurring"
        subtitle="What repeats, without you"
        action={
          <IconButton
            name="plus"
            accessibilityLabel="Add a recurring transaction"
            variant="surface"
            onPress={() => navigation.navigate('RecurringForm', {})}
          />
        }
      />

      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={rules.length === 0}
        onRetry={() => void query.refetch()}
        loadingFallback={
          <View>
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonRow key={`rec-skeleton-${index}`} />
            ))}
          </View>
        }
        empty={{
          icon: 'repeat',
          title: 'Nothing repeating yet',
          description:
            'Set up rent, a subscription or your salary once, and Paisa records it every time it comes round.',
          action: {
            label: 'Add one',
            onPress: () => navigation.navigate('RecurringForm', {}),
          },
        }}
      >
        {monthlyOutgoing > 0 ? (
          <Card radius="xl" padding="xl">
            <Text variant="caption" tone="tertiary">
              Committed every month
            </Text>
            <Text
              variant="amountLg"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              style={{ marginTop: 4 }}
            >
              {formatINR(monthlyOutgoing)}
            </Text>
            <Text variant="caption" tone="tertiary" style={{ marginTop: 6 }}>
              {/* Only the monthly ones. Adding a yearly insurance premium to this
                  would make the number wrong in the direction that matters. */}
              Across your monthly rules. Weekly and yearly ones are listed below.
            </Text>
          </Card>
        ) : null}

        {live.length > 0 ? (
          <Section title="Active" style={{ marginTop: monthlyOutgoing > 0 ? theme.spacing.xxl : 0 }}>
            {live.map((rule, index) => (
              <Fragment key={rule.id}>
                {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
                <RecurringItem
                  rule={rule}
                  categoryName={
                    rule.categoryId ? (categories.get(rule.categoryId)?.name ?? null) : null
                  }
                  categoryIcon={rule.categoryId ? categories.get(rule.categoryId)?.icon : undefined}
                  categoryHue={rule.categoryId ? categories.get(rule.categoryId)?.color : undefined}
                  accountName={accounts.get(rule.accountId)?.name}
                  now={now}
                  onPress={open}
                  onTogglePause={togglePause}
                  busy={pause.isPending}
                />
              </Fragment>
            ))}
          </Section>
        ) : null}

        {paused.length > 0 ? (
          <Section title="Paused" style={{ marginTop: theme.spacing.xxl }}>
            {paused.map((rule, index) => (
              <Fragment key={rule.id}>
                {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
                <RecurringItem
                  rule={rule}
                  categoryName={
                    rule.categoryId ? (categories.get(rule.categoryId)?.name ?? null) : null
                  }
                  categoryIcon={rule.categoryId ? categories.get(rule.categoryId)?.icon : undefined}
                  categoryHue={rule.categoryId ? categories.get(rule.categoryId)?.color : undefined}
                  accountName={accounts.get(rule.accountId)?.name}
                  now={now}
                  onPress={open}
                  onTogglePause={togglePause}
                  busy={pause.isPending}
                />
              </Fragment>
            ))}
          </Section>
        ) : null}

        {showFinished && finished.length > 0 ? (
          <Section title="Finished" style={{ marginTop: theme.spacing.xxl }}>
            {finished.map((rule, index) => (
              <Fragment key={rule.id}>
                {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
                <RecurringItem
                  rule={rule}
                  categoryName={
                    rule.categoryId ? (categories.get(rule.categoryId)?.name ?? null) : null
                  }
                  categoryIcon={rule.categoryId ? categories.get(rule.categoryId)?.icon : undefined}
                  categoryHue={rule.categoryId ? categories.get(rule.categoryId)?.color : undefined}
                  accountName={accounts.get(rule.accountId)?.name}
                  now={now}
                  onPress={open}
                  busy={false}
                />
              </Fragment>
            ))}
          </Section>
        ) : null}

        <Button
          label={showFinished ? 'Hide finished' : 'Show finished'}
          variant="ghost"
          size="sm"
          onPress={() => setShowFinished((current) => !current)}
          style={{ alignSelf: 'center', marginTop: theme.spacing.xl }}
        />
      </QueryState>
    </Screen>
  );
}

function Section({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: object;
}) {
  const theme = useTheme();
  return (
    <View style={style}>
      <Text variant="overline" tone="tertiary" style={{ marginBottom: theme.spacing.sm }}>
        {title}
      </Text>
      <Card padding={0} radius="xl">
        <View style={{ paddingHorizontal: theme.spacing.lg }}>{children}</View>
      </Card>
    </View>
  );
}

type ItemProps = {
  rule: RecurringRule;
  categoryName: string | null;
  categoryIcon?: string;
  categoryHue?: string;
  accountName?: string;
  now: Date;
  onPress: (rule: RecurringRule) => void;
  onTogglePause?: (rule: RecurringRule) => void;
  busy: boolean;
};

function RecurringItem({
  rule,
  categoryName,
  categoryIcon,
  categoryHue,
  accountName,
  now,
  onPress,
  onTogglePause,
  busy,
}: ItemProps) {
  const theme = useTheme();
  const isIncome = rule.type === 'income';
  const isTransfer = rule.type === 'transfer';

  const when = rule.nextRunAt ? relativeDay(new Date(rule.nextRunAt), now) : 'Finished';
  const meta = [rule.scheduleLabel, categoryName ?? (isTransfer ? 'Transfer' : null), accountName]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        opacity: rule.isActive ? 1 : 0.55,
      }}
    >
      <Pressable
        onPress={() => {
          tapFeedback();
          onPress(rule);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${rule.name}, ${formatINR(rule.amount)}, ${rule.scheduleLabel}, ${
          rule.isPaused ? 'paused' : when
        }`}
        accessibilityHint="Opens this recurring transaction"
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          minHeight: 56,
        }}
      >
        <IconTile
          name={isTransfer ? 'repeat' : toIconName(categoryIcon)}
          color={
            isTransfer ? theme.colors.textTertiary : categoryColor(categoryHue ?? 'other')
          }
          size="sm"
        />

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {rule.name}
            </Text>
            {rule.autoCreate ? null : (
              <Icon name="bell" size={12} color={theme.colors.textTertiary} strokeWidth={2.2} />
            )}
          </View>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {meta}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text variant="labelSm" tone={isIncome ? 'positive' : 'primary'} numberOfLines={1}>
            {isIncome ? formatINR(rule.amount, { signed: true }) : formatINR(rule.amount)}
          </Text>
          {rule.isPaused ? (
            <Badge label="Paused" tone="warning" />
          ) : rule.isActive ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {when}
            </Text>
          ) : (
            <Badge label="Done" tone="neutral" />
          )}
        </View>
      </Pressable>

      {onTogglePause ? (
        <IconButton
          name={rule.isPaused ? 'repeat' : 'minus'}
          accessibilityLabel={rule.isPaused ? `Resume ${rule.name}` : `Pause ${rule.name}`}
          accessibilityHint={
            rule.isPaused
              ? 'Resumes from the next occurrence, with nothing backdated'
              : 'Stops it running until you resume it'
          }
          variant="tonal"
          size="sm"
          disabled={busy}
          onPress={() => onTogglePause(rule)}
        />
      ) : null}
    </View>
  );
}
