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
  recurring_created: 'repeat',
};

function accentFor(type: NotificationType, theme: Theme): string {
  switch (type) {
    case 'budget_exceeded':
      return theme.colors.negative;
    case 'budget_warning':
      return theme.colors.warning;
    case 'recurring_upcoming':
      return theme.colors.info;
    default:
      return theme.colors.textTertiary;
  }
}

/**
 * The alerts the server has raised.
 *
 * In-app only for now: everything that makes push work — the triggers, the
 * per-alert de-duplication, the preference switches, the device token store — is
 * built and running, and the only missing piece is the call to Expo's push
 * service. So this is the same list a notification tray would show, read from the
 * same rows.
 *
 * Tapping a row marks it read and goes where the alert is about, because an alert
 * you cannot act on is just an interruption.
 */
export function NotificationsScreen() {
  const theme = useTheme();
  const navigation = useNavigation();

  const query = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const clear = useClearNotifications();

  const notifications = query.data?.notifications ?? [];
  const unread = query.data?.unread ?? 0;

  function open(notification: AppNotification) {
    if (!notification.read) markRead.mutate(notification.id);

    const data = notification.data as { recurringId?: string; transactionId?: string };

    if (notification.type === 'budget_warning' || notification.type === 'budget_exceeded') {
      navigation.navigate('Tabs', { screen: 'Budgets' });
      return;
    }
    if (data.transactionId) {
      navigation.navigate('TransactionDetail', { id: data.transactionId });
      return;
    }
    if (data.recurringId) {
      navigation.navigate('RecurringForm', { id: data.recurringId });
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
              <SkeletonRow key={index} />
            ))}
          </View>
        }
        empty={{
          icon: 'checkCircle',
          title: 'Nothing to report',
          description:
            'Paisa tells you when a budget is close or over, and when a recurring charge is due. Never more than once each.',
        }}
      >
        <Card padding={0} radius="xl">
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            {notifications.map((notification, index) => (
              <Fragment key={notification.id}>
                {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
                <NotificationRow notification={notification} onPress={open} />
              </Fragment>
            ))}
          </View>
        </Card>

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
          {/* A dot rather than a bold row: unread is worth marking, not shouting. */}
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
