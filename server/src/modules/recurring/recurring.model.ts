import { Schema, model, type InferSchemaType } from 'mongoose';

import { PAYMENT_METHODS, TRANSACTION_TYPES } from '../transactions/transaction.model';

export const RECURRENCE_UNITS = ['day', 'week', 'month', 'year'] as const;
export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number];

/**
 * A standing instruction that writes transactions on a schedule: rent, Netflix,
 * the gym, an EMI, a salary credit.
 *
 * The schedule is a unit plus an interval rather than a named frequency, because
 * "monthly", "weekly" and "yearly" are just `{month,1}`, `{week,1}` and
 * `{year,1}` — and expressing them that way means "every 3 months" costs nothing
 * extra instead of needing a fifth enum value and its own branch everywhere.
 *
 * Occurrences are counted, never accumulated. `nextRunAt` is always recomputed as
 * `startDate + unit * interval * occurrencesCreated`, so a rule anchored on the
 * 31st keeps the 31st in every long month instead of collapsing to the 28th the
 * first time February clamps it. See `occurrenceAt` in `lib/time.ts`.
 */
const recurringSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** Shown in the list and used as the transaction's merchant. */
    name: { type: String, required: true, trim: true, maxlength: 120 },

    // --- the transaction this writes, mirroring the transaction model ---
    type: { type: String, required: true, enum: TRANSACTION_TYPES },
    amount: { type: Number, required: true, min: 1 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    destinationAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'upi' },

    // --- the schedule ---
    unit: { type: String, required: true, enum: RECURRENCE_UNITS },
    interval: { type: Number, required: true, default: 1, min: 1, max: 365 },
    /** The anchor. Every occurrence is computed from this, never from the last one. */
    startDate: { type: Date, required: true },
    /** Stops after this instant, if set. */
    endDate: { type: Date, default: null },
    /** Stops after this many occurrences, if set. */
    maxOccurrences: { type: Number, default: null, min: 1 },

    // --- state the scheduler owns ---
    occurrencesCreated: { type: Number, required: true, default: 0 },
    /**
     * When this fires next. Denormalised from the anchor and the count so the
     * scheduler can find due rules with an index instead of loading every rule
     * and computing.
     */
    nextRunAt: { type: Date, required: true, index: true },
    lastRunAt: { type: Date, default: null },

    /**
     * Paused rules keep their place in the schedule rather than their clock.
     * Resuming fast-forwards past everything that would have fired while paused
     * — a gym membership paused for three months should not write three months of
     * backdated charges the moment it comes back.
     */
    isPaused: { type: Boolean, required: true, default: false },
    /**
     * False once the rule has run out of occurrences or passed its end date.
     * Kept rather than deleted so the transactions it wrote still have a parent.
     */
    isActive: { type: Boolean, required: true, default: true },
    /**
     * True writes the transaction automatically; false only raises the "coming
     * up" notification and leaves the entry to the user. An EMI is automatic; a
     * variable electricity bill is a reminder.
     */
    autoCreate: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

// The scheduler's query: everything due, across all users.
recurringSchema.index({ isActive: 1, isPaused: 1, nextRunAt: 1 });
// The list screen, and the "upcoming" strip on Home.
recurringSchema.index({ userId: 1, isActive: 1, nextRunAt: 1 });

export type Recurring = InferSchemaType<typeof recurringSchema>;

export const RecurringModel = model('Recurring', recurringSchema);
