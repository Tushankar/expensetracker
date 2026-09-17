import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * One stored receipt image, and whatever was read off it.
 *
 * The extraction is kept *beside* the transaction rather than merged into it. A
 * receipt says the total was ₹2,380; the transaction says what the user decided to
 * record. Those are usually the same and occasionally not — a split bill, a
 * cashback, a tip added later — and flattening the two would destroy the evidence
 * at exactly the moment it matters. It also means re-reading a receipt can never
 * quietly rewrite a ledger entry.
 *
 * `transactionId` is nullable on purpose: photographing the bill at the counter
 * and filling in the details afterwards is the natural order, so a receipt is
 * allowed to exist before the transaction it will belong to.
 */
const extractedItemSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    /** Integer paise, as printed. Null when the line had no legible figure. */
    amount: { type: Number, default: null },
  },
  { _id: false },
);

const extractionSchema = new Schema(
  {
    merchant: { type: String, default: '', maxlength: 120 },
    /** Integer paise. Null when no total could be read — never a guess. */
    amount: { type: Number, default: null },
    /** The printed line the total was read from, so a person can check it. */
    amountText: { type: String, default: '', maxlength: 120 },
    date: { type: Date, default: null },
    items: { type: [extractedItemSchema], default: [] },
    paymentMethod: { type: String, default: null },
    /** How much of the receipt was legible, by the model's own account. */
    confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'low' },
    model: { type: String, default: '' },
    extractedAt: { type: Date, default: null },
  },
  { _id: false },
);

const receiptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
      index: true,
    },

    /** Cloudinary's id for the asset. What `destroy` takes. */
    publicId: { type: String, required: true, unique: true },
    /** The https delivery URL. Always secure — there is no http variant stored. */
    url: { type: String, required: true },
    bytes: { type: Number, required: true, min: 0 },
    format: { type: String, default: '' },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },

    extraction: { type: extractionSchema, default: null },

    uploadedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

// The two reads: this user's receipts newest first, and the one for a transaction.
receiptSchema.index({ userId: 1, uploadedAt: -1 });
receiptSchema.index({ userId: 1, transactionId: 1 });

export type Receipt = InferSchemaType<typeof receiptSchema>;

export const ReceiptModel = model('Receipt', receiptSchema);
