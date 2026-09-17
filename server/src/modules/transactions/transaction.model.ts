import { Schema, model, type InferSchemaType } from 'mongoose';

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const PAYMENT_METHODS = [
  'upi',
  'cash',
  'credit_card',
  'debit_card',
  'net_banking',
  'bank_transfer',
  'wallet',
  'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const transactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true, enum: TRANSACTION_TYPES },
    /**
     * Integer paise, always positive. `type` carries the direction — storing a
     * signed amount means every aggregation has to remember which sign convention
     * this collection uses, and one of them eventually forgets.
     */
    amount: { type: Number, required: true, min: 1 },
    /**
     * Null on a transfer. Moving your own money between your own accounts is not
     * spending, so it has no spending category — see the note in the service.
     */
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    /** Required on a transfer, forbidden otherwise. Enforced in the schema layer. */
    destinationAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    merchant: { type: String, trim: true, maxlength: 120, default: '' },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'upi' },
    date: { type: Date, required: true },
  },
  { timestamps: true },
);

// The list query: this user, newest first. Every filter narrows within it.
transactionSchema.index({ userId: 1, date: -1, _id: -1 });
transactionSchema.index({ userId: 1, type: 1, date: -1 });
transactionSchema.index({ userId: 1, accountId: 1, date: -1 });
transactionSchema.index({ userId: 1, categoryId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1, merchant: 1 });
// Transfers are found from either side, and the balance recalculation reads both.
transactionSchema.index({ userId: 1, destinationAccountId: 1, date: -1 });
/**
 * Deliberately no `$text` index.
 *
 * Search is a case-insensitive substring match, because people type "swig" and
 * expect Swiggy — which a stemmed, word-boundary text search does not return. A
 * text index would therefore never be consulted by any query this app makes,
 * while still costing a write on every insert and update to the largest
 * collection here. The regex runs inside the `userId` index bound, so it scans
 * one person's transactions rather than the collection.
 */

export type Transaction = InferSchemaType<typeof transactionSchema>;

export const TransactionModel = model('Transaction', transactionSchema);
