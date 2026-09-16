import { Schema, Types, model, type InferSchemaType } from 'mongoose';

/**
 * One row per issued refresh token.
 *
 * Refresh tokens are long-lived, so a stateless one cannot be revoked — signing
 * out, changing a password or spotting a stolen token would all be no-ops until it
 * expired. Storing a digest per token makes revocation a single update, and makes
 * the reuse detection in `auth.service` possible.
 */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    /** SHA-256 of the token. The token itself is never stored. */
    tokenHash: { type: String, required: true, unique: true },
    /** The `jti` claim, so rotation can point a revoked row at its successor. */
    jti: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    /** Set when this token was rotated, naming the token that replaced it. */
    replacedBy: { type: String },
    userAgent: { type: String, maxlength: 256 },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: true },
);

// Mongo sweeps expired sessions on its own — no cron, no growing dead collection.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshToken = InferSchemaType<typeof refreshTokenSchema>;

export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
