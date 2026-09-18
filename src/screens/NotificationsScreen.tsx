import { useNavigation } from '@react-navigation/native';
import { Fragment } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import {
  useClearNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type AppNotification,
  type NotificationType,
} from '@/api';
import { QueryState } from '@/components/data/QueryState';
import {
  Button,
  Card,
  Divider,
  IconTile,
  PageHeader,
  Screen,
  SectionHeader,
  SkeletonRow,
  Text,
  type IconName,
} from '@/components/ui';
import { useTheme, type Theme } from '@/theme';
import { formatDayLabel, formatTime } from '@/utils/date';
import { tapFeedback } from '@/utils/haptics';

const ICON: Record<NotificationType, IconName> = {
  budget_warning: 'alertTriangle',
  budget_exceeded: 'alertCircle',
  recurring_upcoming: 'clock',
  recurring_due: 'calendar',
  recurring_created: 'repeat',
  money_owed_due: 'user',
  repayment_due: 'card',
  unusual_spending: 'trendingUp',
  monthly_summary: 'pieChart',
  system: 'bell',
};

function accentFor(type: NotificationType, theme: Theme): string {
  switch (type) {
    case 'budget_exceeded':
      return theme.colors.negative;
    case 'budget_warning':
    case 'recurring_due':
    case 'repayment_due':
    case 'unusual_spending':
      return theme.colors.warning;
    case 'recurring_upcoming':
      return theme.colors.info;
    case 'money_owed_due':
    case 'monthly_summary':
      return theme.colors.brand;
    case 'recurring_created':
      return theme.colors.positive;
    default:
      return theme.colors.textTertiary;
  }
}

function groupNotifications(items: AppNotification[]): {
  title: string;
  items: AppNotification[];
}[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const today: AppNotification[] = [];
  const yest: AppNotification[] = [];
  const earlier: AppNotification[] = [];

  for (const n of items) {
    const itemDate = new Date(n.createdAt);
    const itemStr = itemDate.toDateString();
    if (itemStr === todayStr) {
      today.push(n);
    } else if (itemStr === yesterdayStr) {
      yest.push(n);
    } else {
      earlier.push(n);
    }
  }

  const sections: { title: string; items: AppNotification[] }[] = [];
  if (today.length > 0) sections.push({ title: 'Today', items: today });
  if (yest.length > 0) sections.push({ title: 'Yesterday', items: yest });
  if (earlier.length > 0) sections.push({ title: 'Earlier', items: earlier });

  return sections;
}

export function NotificationsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();

  const query = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const clear = useClearNotifications();

  const notifications = query.data?.notifications ?? [];
  const unread = query.data?.unread ?? 0;
  const sections = groupNotifications(notifications);

  function open(notification: AppNotification) {
    if (!notification.read) markRead.mutate(notification.id);

    const data = (notification.data ?? {}) as {
      budgetId?: string;
      recurringId?: string;
      transactionId?: string;
      personId?: string;
      obligationId?: string;
      screen?: string;
    };

    switch (notification.type) {
      case 'budget_warning':
      case 'budget_exceeded':
        navigation.navigate('Tabs', { screen: 'Budgets' });
        break;
      case 'recurring_upcoming':
      case 'recurring_due':
      case 'recurring_created':
        if (data.recurringId) {
          try {
            navigation.navigate('RecurringForm', { id: data.recurringId });
          } catch {
            navigation.navigate('Recurring');
          }
        } else {
          navigation.navigate('Recurring');
        }
        break;
      case 'money_owed_due':
      case 'repayment_due':
        if (data.personId) {
          try {
            navigation.navigate('PersonDetail', { id: data.personId });
          } catch {
            navigation.navigate('People');
          }
        } else {
          navigation.navigate('People');
        }
        break;
      case 'unusual_spending':
      case 'monthly_summary':
        navigation.navigate('Tabs', { screen: 'Insights' });
        break;
      default:
        if (data.transactionId) {
          navigation.navigate('TransactionDetail', { id: data.transactionId });
        }
        break;
    }
  }

  return (
    <Screen
      topInset={false}
      bottomInset={theme.spacing.xxl}
      testID="notifications-screen"
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
        title="Alerts"
        subtitle={unread > 0 ? `${unread} unread` : 'All caught up'}
        action={
          unread > 0 ? (
            <Button
              label="Mark all read"
              variant="ghost"
              size="sm"
              loading={markAll.isPending}
              onPress={() => markAll.mutate()}
            />
          ) : undefined
        }
      />

      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={notifications.length === 0}
        onRetry={() => void query.refetch()}
        loadingFallback={
          <View>
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonRow key={`notif-skeleton-${index}`} />
            ))}
          </View>
        }
        empty={{
          icon: 'checkCircle',
          title: 'Nothing to report',
          description:
            'Paisa tells you when a budget is close or over, when payments or money owed are due, and gives spending insights. Never more than once each.',
        }}
      >
        <View style={{ gap: theme.spacing.xl }}>
          {sections.map((section) => (
            <View key={section.title} style={{ gap: theme.spacing.sm }}>
              <SectionHeader title={section.title} />
              <Card padding={0} radius="xl">
                <View style={{ paddingHorizontal: theme.spacing.lg }}>
                  {section.items.map((notification, index) => (
                    <Fragment key={notification.id}>
                      {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
                      <NotificationRow notification={notification} onPress={open} />
                    </Fragment>
                  ))}
                </View>
              </Card>
            </View>
          ))}
        </View>

        <Button
          label="Clear all"
          variant="ghost"
          size="sm"
          loading={clear.isPending}
          onPress={() => clear.mutate()}
          style={{ alignSelf: 'center', marginTop: theme.spacing.xl }}
        />
      </QueryState>
    </Screen>
  );
}

function NotificationRow({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: (notification: AppNotification) => void;
}) {
  const theme = useTheme();
  const accent = accentFor(notification.type, theme);
  const when = `${formatDayLabel(notification.createdAt)} · ${formatTime(notification.createdAt)}`;

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress(notification);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${notification.read ? '' : 'Unread. '}${notification.title}. ${notification.body}`}
      accessibilityHint="Opens what this is about"
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.lg,
        backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
      })}
    >
      <IconTile name={ICON[notification.type]} color={accent} size="sm" />

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="label" numberOfLines={2} style={{ flexShrink: 1 }}>
            {notification.title}
          </Text>
          {notification.read ? null : (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.brand,
              }}
            />
          )}
        </View>
        <Text variant="bodySm" tone="secondary" numberOfLines={2}>
          {notification.body}
        </Text>
        <Text variant="caption" tone="tertiary">
          {when}
        </Text>
      </View>
    </Pressable>
  );
}
