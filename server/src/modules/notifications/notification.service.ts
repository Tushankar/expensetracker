import { Types } from 'mongoose';

import { logger } from '../../config/logger';
import { ApiError } from '../../lib/ApiError';
import { pageMeta, type PageMeta } from '../../lib/pagination';
import { UserModel } from '../users/user.model';
import { DeviceTokenModel, type Platform } from './deviceToken.model';
import {
  NotificationModel,
  type Notification,
  type NotificationType,
} from './notification.model';
import type {
  NotificationPreferences,
  UpdateNotificationPreferences,
} from './notification.schemas';
import { applyPreviewPrivacy, isInQuietHours } from './alertEngine';

export type PublicNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  read: boolean;
  delivered: boolean;
  scheduledFor: string;
  createdAt: string;
};

type NotificationLike = Notification & {
  _id: Types.ObjectId;
  createdAt?: Date;
  delivered?: boolean;
  scheduledFor?: Date;
  metadata?: Record<string, unknown>;
};

export function toPublicNotification(row: NotificationLike): PublicNotification {
  return {
    id: String(row._id),
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    data: (row.data ?? {}) as Record<string, unknown>,
    metadata: (row.metadata ?? row.data ?? {}) as Record<string, unknown>,
    read: row.readAt !== null && row.readAt !== undefined,
    delivered: Boolean(row.delivered),
    scheduledFor: (row.scheduledFor ?? row.createdAt ?? new Date()).toISOString(),
    createdAt: (row.createdAt ?? new Date()).toISOString(),
  };
}

export type RaiseInput = {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** Names the exact thing and period this alert is about. See the model. */
  dedupeKey: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  scheduledFor?: Date;
};

/** Which preference switch governs which alert. */
const PREFERENCE_FOR: Partial<
  Record<
    NotificationType,
    | 'budgetAlerts'
    | 'recurringAlerts'
    | 'peopleAlerts'
    | 'spendingAlerts'
    | 'monthlySummaryAlerts'
  >
> = {
  budget_warning: 'budgetAlerts',
  budget_exceeded: 'budgetAlerts',
  recurring_upcoming: 'recurringAlerts',
  recurring_due: 'recurringAlerts',
  recurring_created: 'recurringAlerts',
  money_owed_due: 'peopleAlerts',
  repayment_due: 'peopleAlerts',
  unusual_spending: 'spendingAlerts',
  monthly_summary: 'monthlySummaryAlerts',
};

/**
 * Records an alert, at most once per `dedupeKey`.
 *
 * Returns true only when this call is the one that created it, so a caller can
 * decide whether to push. The duplicate case is the *normal* case, not an error:
 * the budget check runs after every transaction write, so the second through
 * hundredth write in a month all land here and all get quietly dropped by the
 * unique index.
 *
 * Never throws. An alert that cannot be written must not fail the transaction
 * that triggered it — the money is the product, the notification is a courtesy.
 */
export async function raise(input: RaiseInput): Promise<boolean> {
  try {
    const user = await UserModel.findById(input.userId).select('notificationPrefs timezone').lean();
    if (!user) return false;

    const prefKey = PREFERENCE_FOR[input.type];
    if (prefKey && (user.notificationPrefs as any)?.[prefKey] === false) {
      return false;
    }

    const result = await NotificationModel.updateOne(
      { userId: input.userId, dedupeKey: input.dedupeKey },
      {
        $setOnInsert: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data: input.data ?? input.metadata ?? {},
          metadata: input.metadata ?? input.data ?? {},
          dedupeKey: input.dedupeKey,
          readAt: null,
          delivered: false,
          scheduledFor: input.scheduledFor ?? new Date(),
        },
      },
      { upsert: true },
    );

    const isNew = result.upsertedCount === 1;
    if (isNew) {
      await deliver(input, user);
    }
    return isNew;
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return false;
    logger.warn({ err: error, type: input.type }, 'could not record notification');
    return false;
  }
}

/**
 * Push notification delivery helper.
 * Delivers via Expo Push API if push tokens exist and not in quiet hours.
 * Never throws — failures are logged and recorded without interrupting user operations.
 */
async function deliver(
  input: RaiseInput,
  userDoc?: {
    notificationPrefs?: any;
    timezone?: string;
  } | null,
): Promise<void> {
  try {
    const user =
      userDoc ??
      (await UserModel.findById(input.userId).select('notificationPrefs timezone pushTokens').lean());
    if (!user) return;

    // Check quiet hours
    const timezone = user.timezone ?? 'Asia/Kolkata';
    const quietHours = user.notificationPrefs?.quietHours;
    if (isInQuietHours(new Date(), timezone, quietHours)) {
      logger.info(
        { userId: String(input.userId), type: input.type },
        'notification in quiet hours; skipping immediate push',
      );
      return;
    }

    // Fetch device tokens
    const [legacyUser, deviceTokens] = await Promise.all([
      UserModel.findById(input.userId).select('pushTokens').lean(),
      DeviceTokenModel.find({ userId: input.userId, enabled: true }).select('token').lean(),
    ]);

    const allTokens = Array.from(
      new Set([
        ...(legacyUser?.pushTokens ?? []),
        ...deviceTokens.map((d) => d.token),
      ]),
    ).filter(Boolean);

    if (allTokens.length === 0) return;

    // Privacy preview mode
    const previewMode = user.notificationPrefs?.previewMode ?? 'private';
    const { title, body } = applyPreviewPrivacy(input.title, input.body, previewMode);

    logger.info(
      { userId: String(input.userId), type: input.type, devices: allTokens.length },
      'delivering push notification',
    );

    // Call Expo push service batch endpoint
    const messages = allTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: input.data ?? {},
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (response.ok) {
      await NotificationModel.updateOne(
        { userId: input.userId, dedupeKey: input.dedupeKey },
        { $set: { delivered: true } },
      );
    } else {
      logger.warn(
        { status: response.status, statusText: response.statusText },
        'Expo push delivery non-200 response',
      );
    }
  } catch (error) {
    logger.warn({ err: error, type: input.type }, 'Push delivery network error; safely ignored');
  }
}

export async function listNotifications(
  userId: string,
  options: { page: number; limit: number; unreadOnly: boolean; type?: NotificationType },
): Promise<{ notifications: PublicNotification[]; meta: PageMeta; unread: number }> {
  const filter = {
    userId: new Types.ObjectId(userId),
    ...(options.unreadOnly ? { readAt: null } : {}),
    ...(options.type ? { type: options.type } : {}),
  };

  const [rows, total, unread] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments({ userId: new Types.ObjectId(userId), readAt: null }),
  ]);

  return {
    notifications: rows.map(toPublicNotification),
    meta: pageMeta(options.page, options.limit, total),
    unread,
  };
}

export async function countUnread(userId: string): Promise<number> {
  return NotificationModel.countDocuments({ userId: new Types.ObjectId(userId), readAt: null });
}

export async function markRead(userId: string, notificationId: string): Promise<PublicNotification> {
  const row = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, userId: new Types.ObjectId(userId), readAt: null },
    { $set: { readAt: new Date() } },
    { new: true },
  );

  if (!row) {
    const existing = await NotificationModel.findOne({
      _id: notificationId,
      userId: new Types.ObjectId(userId),
    });
    if (!existing) throw ApiError.notFound('Notification not found');
    return toPublicNotification(existing);
  }

  return toPublicNotification(row);
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await NotificationModel.updateMany(
    { userId: new Types.ObjectId(userId), readAt: null },
    { $set: { readAt: new Date() } },
  );
  return result.modifiedCount;
}

export async function clearAll(userId: string): Promise<number> {
  const result = await NotificationModel.deleteMany({ userId: new Types.ObjectId(userId) });
  return result.deletedCount ?? 0;
}

// -----------------------------------------------------------------------------
// Preferences API
// -----------------------------------------------------------------------------

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const user = await UserModel.findById(userId).select('notificationPrefs').lean();
  if (!user) throw ApiError.notFound('User not found');

  const prefs = user.notificationPrefs ?? ({} as any);

  return {
    budgetAlerts: prefs.budgetAlerts !== false,
    recurringAlerts: prefs.recurringAlerts !== false,
    peopleAlerts: prefs.peopleAlerts !== false,
    spendingAlerts: prefs.spendingAlerts !== false,
    monthlySummaryAlerts: prefs.monthlySummaryAlerts !== false,
    previewMode: prefs.previewMode ?? 'private',
    quietHours: prefs.quietHours ?? { enabled: true, start: '22:00', end: '08:00' },
  };
}

export async function updateNotificationPreferences(
  userId: string,
  patch: UpdateNotificationPreferences,
): Promise<NotificationPreferences> {
  const user = await UserModel.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const current = (user.notificationPrefs ?? {}) as any;

  user.notificationPrefs = {
    budgetAlerts: patch.budgetAlerts ?? current.budgetAlerts ?? true,
    recurringAlerts: patch.recurringAlerts ?? current.recurringAlerts ?? true,
    peopleAlerts: patch.peopleAlerts ?? current.peopleAlerts ?? true,
    spendingAlerts: patch.spendingAlerts ?? current.spendingAlerts ?? true,
    monthlySummaryAlerts: patch.monthlySummaryAlerts ?? current.monthlySummaryAlerts ?? true,
    previewMode: patch.previewMode ?? current.previewMode ?? 'private',
    quietHours: {
      enabled: patch.quietHours?.enabled ?? current.quietHours?.enabled ?? true,
      start: patch.quietHours?.start ?? current.quietHours?.start ?? '22:00',
      end: patch.quietHours?.end ?? current.quietHours?.end ?? '08:00',
    },
  };

  await user.save();
  return getNotificationPreferences(userId);
}

// -----------------------------------------------------------------------------
// Device Token API
// -----------------------------------------------------------------------------

export async function registerDevice(
  userId: string,
  token: string,
  platform: Platform = 'unknown',
  deviceId?: string | null,
): Promise<{ registered: boolean; id: string }> {
  // Upsert in DeviceTokenModel
  const doc = await DeviceTokenModel.findOneAndUpdate(
    { token },
    {
      $set: {
        userId: new Types.ObjectId(userId),
        platform,
        deviceId: deviceId ?? null,
        enabled: true,
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );

  // Maintain backward compatibility with UserModel.pushTokens
  await UserModel.updateOne({ _id: userId }, { $addToSet: { pushTokens: token } });

  return { registered: true, id: String(doc._id) };
}

export async function unregisterDevice(userId: string, token: string): Promise<boolean> {
  await DeviceTokenModel.updateOne(
    { userId: new Types.ObjectId(userId), token },
    { $set: { enabled: false } },
  );
  await UserModel.updateOne({ _id: userId }, { $pull: { pushTokens: token } });
  return true;
}

export async function deleteDevice(userId: string, deviceIdOrToken: string): Promise<boolean> {
  const isObjectId = Types.ObjectId.isValid(deviceIdOrToken);
  const filter = isObjectId
    ? { _id: deviceIdOrToken, userId: new Types.ObjectId(userId) }
    : { token: deviceIdOrToken, userId: new Types.ObjectId(userId) };

  const doc = await DeviceTokenModel.findOneAndDelete(filter);
  if (doc?.token) {
    await UserModel.updateOne({ _id: userId }, { $pull: { pushTokens: doc.token } });
  }
  return doc !== null;
}

export async function listDevices(userId: string) {
  return DeviceTokenModel.find({ userId: new Types.ObjectId(userId) })
    .sort({ lastSeenAt: -1 })
    .lean();
}
