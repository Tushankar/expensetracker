import { Types } from 'mongoose';

import { logger } from '../../config/logger';
import { ApiError } from '../../lib/ApiError';
import { pageMeta, type PageMeta } from '../../lib/pagination';
import { UserModel } from '../users/user.model';

import {
  NotificationModel,
  type Notification,
  type NotificationType,
} from './notification.model';

export type PublicNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
};

type NotificationLike = Notification & { _id: Types.ObjectId; createdAt?: Date };

export function toPublicNotification(row: NotificationLike): PublicNotification {
  return {
    id: String(row._id),
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    data: (row.data ?? {}) as Record<string, unknown>,
    read: row.readAt !== null && row.readAt !== undefined,
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
};

/** Which preference switch governs which alert. */
const PREFERENCE_FOR: Record<NotificationType, 'budgetAlerts' | 'recurringAlerts'> = {
  budget_warning: 'budgetAlerts',
  budget_exceeded: 'budgetAlerts',
  recurring_upcoming: 'recurringAlerts',
  recurring_created: 'recurringAlerts',
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
    const user = await UserModel.findById(input.userId).select('notificationPrefs').lean();
    if (!user) return false;

    const preference = PREFERENCE_FOR[input.type];
    if (user.notificationPrefs?.[preference] === false) return false;

    const created = await NotificationModel.findOneAndUpdate(
      { userId: input.userId, dedupeKey: input.dedupeKey },
      {
        $setOnInsert: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data: input.data ?? {},
          dedupeKey: input.dedupeKey,
          readAt: null,
        },
      },
      { upsert: true, new: false, rawResult: true },
    );

    // `lastErrorObject.updatedExisting` is false exactly when this call inserted.
    const isNew = created?.lastErrorObject?.updatedExisting === false;
    if (isNew) await deliver(input);
    return Boolean(isNew);
  } catch (error) {
    // Includes the duplicate-key race between two concurrent upserts, which is a
    // correct outcome rather than a failure.
    if ((error as { code?: number })?.code === 11000) return false;
    logger.warn({ err: error, type: input.type }, 'could not record notification');
    return false;
  }
}

/**
 * The push seam.
 *
 * Deliberately a no-op beyond a log line. Everything upstream — the triggers, the
 * dedupe, the per-user preferences, the token storage on the user — is what takes
 * real work to get right, and it is all here. Sending is then one call to Expo's
 * push service from inside this function, with no other file changing.
 */
async function deliver(input: RaiseInput): Promise<void> {
  const user = await UserModel.findById(input.userId).select('pushTokens').lean();
  const tokens = user?.pushTokens ?? [];

  logger.info(
    { userId: String(input.userId), type: input.type, devices: tokens.length },
    'notification raised',
  );

  // TODO(step-4): POST the batch to https://exp.host/--/api/v2/push/send, and
  // drop any token the response reports as DeviceNotRegistered.
}

export async function listNotifications(
  userId: string,
  options: { page: number; limit: number; unreadOnly: boolean },
): Promise<{ notifications: PublicNotification[]; meta: PageMeta; unread: number }> {
  const filter = {
    userId: new Types.ObjectId(userId),
    ...(options.unreadOnly ? { readAt: null } : {}),
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
    // Already read is not a failure — two taps on the same row should not error.
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

/** Registers a device for push. Idempotent — the same token twice is one entry. */
export async function registerDevice(userId: string, token: string): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $addToSet: { pushTokens: token } });
}

export async function unregisterDevice(userId: string, token: string): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $pull: { pushTokens: token } });
}
