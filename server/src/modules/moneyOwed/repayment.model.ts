import { Schema, model, type InferSchemaType } from 'mongoose';

const repaymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    moneyOwedId: { type: Schema.Types.ObjectId, ref: 'MoneyOwed', required: true, index: true },
    personId: { type: Schema.Types.ObjectId, ref: 'Person', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    date: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true },
);

repaymentSchema.index({ userId: 1, moneyOwedId: 1, date: -1 });
repaymentSchema.index({ userId: 1, personId: 1, date: -1 });
repaymentSchema.index({ userId: 1, date: -1 });

export type Repayment = InferSchemaType<typeof repaymentSchema>;

export const RepaymentModel = model('Repayment', repaymentSchema);
