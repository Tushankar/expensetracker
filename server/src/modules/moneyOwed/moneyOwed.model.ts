import { Schema, model, type InferSchemaType } from 'mongoose';

export const OBLIGATION_DIRECTIONS = ['owed_to_me', 'i_owe'] as const;
export type ObligationDirection = (typeof OBLIGATION_DIRECTIONS)[number];

export const OBLIGATION_TYPES = ['loan', 'paid_for', 'borrowed', 'split'] as const;
export type ObligationType = (typeof OBLIGATION_TYPES)[number];

export const OBLIGATION_STATUSES = ['active', 'settled', 'written_off'] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

const moneyOwedSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    personId: { type: Schema.Types.ObjectId, ref: 'Person', required: true, index: true },
    direction: { type: String, required: true, enum: OBLIGATION_DIRECTIONS },
    type: { type: String, required: true, enum: OBLIGATION_TYPES },
    /**
     * Integer paise, positive.
     */
    originalAmount: { type: Number, required: true, min: 1 },
    remainingAmount: { type: Number, required: true, min: 0 },
    purpose: { type: String, required: true, trim: true, maxlength: 200 },
    /**
     * Optional category for contextual reference (e.g. Paid for someone Shopping or Food),
     * without recording personal spend.
     */
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    dueDate: { type: Date, default: null },
    status: { type: String, required: true, enum: OBLIGATION_STATUSES, default: 'active', index: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true },
);

moneyOwedSchema.index({ userId: 1, status: 1, createdAt: -1 });
moneyOwedSchema.index({ userId: 1, personId: 1, status: 1 });
moneyOwedSchema.index({ userId: 1, direction: 1, createdAt: -1 });

export type MoneyOwed = InferSchemaType<typeof moneyOwedSchema>;

export const MoneyOwedModel = model('MoneyOwed', moneyOwedSchema);
