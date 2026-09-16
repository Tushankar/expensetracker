import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /**
     * Stored lower-cased and unique. The lower-casing happens in the service layer
     * *and* here — the index is what actually enforces it, and an index on a field
     * the application sometimes writes in mixed case is an index that lets two
     * "same" accounts exist.
     */
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    currency: { type: String, required: true, default: 'INR', uppercase: true, minlength: 3, maxlength: 3 },
    /**
     * IANA zone, used for every boundary the server computes for itself: which
     * month a budget covers, when a recurring rule fires, which day a transaction
     * is bucketed into. See `lib/time.ts` for why this cannot be UTC.
     */
    timezone: { type: String, required: true, default: 'Asia/Kolkata', maxlength: 64 },
    /**
     * Which alerts this user wants. The scheduler checks these before writing a
     * notification, so switching one off stops it at the source rather than
     * hiding it in the client.
     */
    notificationPrefs: {
      budgetAlerts: { type: Boolean, required: true, default: true },
      recurringAlerts: { type: Boolean, required: true, default: true },
    },
    /**
     * Expo push tokens, one per device. Stored so the delivery seam in
     * `notification.service` has somewhere to send to once push is wired up;
     * nothing reads them yet.
     */
    pushTokens: { type: [String], required: true, default: [] },
    /**
     * Bumped whenever every live session must die — a password change, an explicit
     * "sign out everywhere". Access tokens carry the version they were minted with
     * and `requireAuth` rejects any that no longer match, which is what closes the
     * up-to-15-minute window a stateless JWT would otherwise leave open.
     */
    tokenVersion: { type: Number, required: true, default: 0 },
    /** Set once the default categories and accounts have been created. */
    seededAt: { type: Date },
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = model('User', userSchema);
