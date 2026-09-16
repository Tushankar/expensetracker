import { Schema, model, type InferSchemaType } from 'mongoose';

export const ACCOUNT_TYPES = ['bank', 'cash', 'credit_card', 'wallet', 'savings', 'other'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

const accountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    type: { type: String, required: true, enum: ACCOUNT_TYPES },
    /**
     * Integer paise, never a float of rupees. 0.1 + 0.2 !== 0.3 in IEEE-754, and a
     * ledger that drifts by a paisa is a ledger nobody trusts. The mobile client
     * uses the same unit end to end, so nothing has to convert in the middle.
     *
     * Negative is legitimate: a credit card's balance is what you owe, and an
     * overdrawn bank account is a real state a tracker should be able to show.
     */
    balance: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, default: 'INR', uppercase: true, minlength: 3, maxlength: 3 },
    /** Name from the mobile icon registry, e.g. `bank`. */
    icon: { type: String, required: true, default: 'wallet', maxlength: 40 },
    /** Hex, for the account's tile and chart band. */
    color: { type: String, required: true, default: '#7856F0', maxlength: 9 },
    /** Bank or issuer, shown under the account name. */
    institution: { type: String, trim: true, maxlength: 60 },
    /** Last four digits of the card or account number. Nothing longer is stored. */
    last4: { type: String, trim: true, maxlength: 4 },
    /**
     * Archived rather than deleted. A deleted account would orphan every
     * transaction that referenced it, and history is the entire point of the app.
     */
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

// One account per name per user. Scoped to the user so two people can both have
// a "Cash", and partial so archiving a name frees it for reuse.
accountSchema.index(
  { userId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
accountSchema.index({ userId: 1, isActive: 1, createdAt: 1 });

export type Account = InferSchemaType<typeof accountSchema>;

export const AccountModel = model('Account', accountSchema);
