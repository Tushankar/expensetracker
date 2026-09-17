import { Schema, model, type InferSchemaType } from 'mongoose';

import { PAYMENT_METHODS } from '../transactions/transaction.model';

/**
 * What this user has filed each merchant under, and how often.
 *
 * One row per (user, merchant, category) rather than one per merchant, which is
 * what makes a correction work. Filing Amazon under Shopping nine times and then
 * once under Electronics does not erase the nine — it records a second opinion
 * that has to earn its place. The recall picks the row with the highest count and,
 * when two are level, the one used most recently, so a genuine change of mind
 * takes over after a couple of repeats while a single slip does not.
 *
 * Storing only the winner would make the last tap authoritative, and one mistyped
 * category would poison every future suggestion for that merchant.
 */
const merchantMemorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /**
     * The merchant name reduced to something that matches across how people
     * actually type: `IndianOil`, `INDIAN OIL`, `indian oil #4412` all collapse
     * together. Never shown to anyone.
     */
    merchantKey: { type: String, required: true, maxlength: 120 },
    /** The most recent spelling, for display. */
    merchantLabel: { type: String, required: true, maxlength: 120 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    count: { type: Number, required: true, default: 1, min: 1 },
    lastUsedAt: { type: Date, required: true, default: () => new Date() },
    /** The account this merchant was last filed under. A suggestion, not a command. */
    preferredAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    /** The payment method this merchant was last filed with. */
    preferredPaymentMethod: { type: String, enum: [...PAYMENT_METHODS, null], default: null },
  },
  { timestamps: true },
);

// The learning write is an upsert on exactly this, so it has to be unique.
merchantMemorySchema.index({ userId: 1, merchantKey: 1, categoryId: 1 }, { unique: true });
// The recall: this user's rows for one merchant, best first.
merchantMemorySchema.index({ userId: 1, merchantKey: 1, count: -1, lastUsedAt: -1 });

export type MerchantMemory = InferSchemaType<typeof merchantMemorySchema>;

export const MerchantMemoryModel = model('MerchantMemory', merchantMemorySchema);
