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
