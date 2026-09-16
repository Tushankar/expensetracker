import { Schema, model, type InferSchemaType } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'budget_warning',
  'budget_exceeded',
  'recurring_upcoming',
  'recurring_created',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * One alert, already decided and worded.
 *
 * The important field is `dedupeKey`. Every alert this app raises is *about* a
 * specific thing in a specific period — this budget, this month; this rule, this
 * occurrence — and the key names exactly that. A unique index on it is what makes
 * "do not spam the user" a property of the database rather than a discipline the
 * calling code has to remember: the budget check runs after every single
 * transaction write, and all but the first insert for a given month simply fail
 * the index and are ignored.
 *
 * Doing it this way also survives restarts, concurrent writes and two devices
 * saving at once, none of which an in-memory "already sent" set would.
 */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true, enum: NOTIFICATION_TYPES },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 300 },
    /**
     * What the row points at, so tapping it can open the right screen:
     * `{ budgetId, categoryId, recurringId, transactionId, month }`.
     */
    data: { type: Schema.Types.Mixed, default: {} },
    /** See the note above — this is the anti-spam mechanism. */
    dedupeKey: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
// The list, newest first, and the unread badge.
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
// Alerts are only interesting while they are current; two months is generous.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });

export type Notification = InferSchemaType<typeof notificationSchema>;

export const NotificationModel = model('Notification', notificationSchema);
