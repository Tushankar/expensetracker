import { Schema, model, type InferSchemaType } from 'mongoose';

export const BUDGET_SCOPES = ['overall', 'category'] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];

/**
 * A monthly spending cap: one optional overall budget, plus one per category.
 *
 * A budget is a standing rule, not a row per month. Materialising one document
 * per category per month would mean a write every month for every user just to
 * keep the same numbers, and a gap in the data for anyone who did not open the
 * app — so the cap is stored once and the *spend* against it is aggregated from
 * the transactions on read. That also means editing a budget corrects history
 * rather than only applying going forward, which is what someone who just fixed
 * a typo expects.
 */
const budgetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scope: { type: String, required: true, enum: BUDGET_SCOPES },
    /** Null for the overall budget, required for a category one. */
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    /** Integer paise. The cap for one calendar month. */
    amount: { type: Number, required: true, min: 1 },
    /**
     * Percentage of the cap at which a warning fires, 50–99.
     *
     * Per budget rather than global: ₹500 of a ₹40,000 rent budget is noise,
     * while the same slice of a ₹2,000 coffee budget is worth knowing about.
     */
    warnAtPercent: { type: Number, required: true, default: 80, min: 50, max: 99 },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

/**
 * One budget per target. The partial filter means archiving a budget frees its
 * category for a new one, and the null `categoryId` on an overall budget makes
 * this enforce "at most one overall budget" for free.
 */
budgetSchema.index(
  { userId: 1, scope: 1, categoryId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
budgetSchema.index({ userId: 1, isActive: 1 });

export type Budget = InferSchemaType<typeof budgetSchema>;

export const BudgetModel = model('Budget', budgetSchema);
