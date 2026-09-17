import { Types, type ClientSession } from 'mongoose';

import { ApiError } from '../../lib/ApiError';
import { withTransaction } from '../../lib/session';
import { adjustBalance, requireOwnedAccount } from '../accounts/account.service';
import { requireOwnedCategory } from '../categories/category.service';
import { findOrCreatePerson, requireOwnedPerson } from '../people/people.service';
import { PersonModel } from '../people/person.model';

import {
  MoneyOwedModel,
  type MoneyOwed,
  type ObligationDirection,
  type ObligationStatus,
  type ObligationType,
} from './moneyOwed.model';
import { RepaymentModel, type Repayment } from './repayment.model';
import type {
  CreateMoneyOwedInput,
  ListMoneyOwedQuery,
  RecordRepaymentInput,
  UpdateMoneyOwedInput,
} from './moneyOwed.schemas';

export type PublicMoneyOwed = {
  id: string;
  personId: string;
  personName: string;
  direction: ObligationDirection;
  type: ObligationType;
  originalAmount: number;
  remainingAmount: number;
  purpose: string;
  categoryId: string | null;
  accountId: string;
  dueDate: string | null;
  status: ObligationStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicRepayment = {
  id: string;
  moneyOwedId: string;
  personId: string;
  amount: number;
  accountId: string;
  date: string;
  note: string;
  createdAt: string;
};

type MoneyOwedDoc = MoneyOwed & { _id: Types.ObjectId; createdAt?: Date; updatedAt?: Date };
type RepaymentDoc = Repayment & { _id: Types.ObjectId; createdAt?: Date };

export function toPublicMoneyOwed(doc: MoneyOwedDoc, personName = ''): PublicMoneyOwed {
  return {
    id: String(doc._id),
    personId: String(doc.personId),
    personName,
    direction: doc.direction as ObligationDirection,
    type: doc.type as ObligationType,
    originalAmount: doc.originalAmount,
    remainingAmount: doc.remainingAmount,
    purpose: doc.purpose,
    categoryId: doc.categoryId ? String(doc.categoryId) : null,
    accountId: String(doc.accountId),
    dueDate: doc.dueDate ? doc.dueDate.toISOString() : null,
    status: doc.status as ObligationStatus,
    note: doc.note ?? '',
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

export function toPublicRepayment(doc: RepaymentDoc): PublicRepayment {
  return {
    id: String(doc._id),
    moneyOwedId: String(doc.moneyOwedId),
    personId: String(doc.personId),
    amount: doc.amount,
    accountId: String(doc.accountId),
    date: doc.date.toISOString(),
    note: doc.note ?? '',
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

export async function requireOwnedObligation(
  userId: string,
  obligationId: string,
  session?: ClientSession,
) {
  const obligation = await MoneyOwedModel.findOne({
    _id: new Types.ObjectId(obligationId),
    userId: new Types.ObjectId(userId),
  }).session(session ?? null);

  if (!obligation) throw ApiError.notFound('Obligation not found', { obligationId });
  return obligation;
}

/**
 * Creates a new financial obligation and adjusts account balance accordingly.
 *
 * Rules:
 * - "owed_to_me" (e.g. loan, paid_for): user sent money out -> account balance decreases by -amount.
 * - "i_owe" (e.g. borrowed money): user received money in -> account balance increases by +amount.
 * - In neither case is personal expense or income modified!
 */
export async function createMoneyOwed(
  userId: string,
  input: CreateMoneyOwedInput,
): Promise<PublicMoneyOwed> {
  const userObjectId = new Types.ObjectId(userId);

  // Resolve person
  let personId: Types.ObjectId;
  let personName: string;

  if (input.personId) {
    const person = await requireOwnedPerson(userId, input.personId);
    personId = person._id;
    personName = person.name;
  } else {
    const person = await findOrCreatePerson(userId, input.personName!);
    personId = new Types.ObjectId(person.id);
    personName = person.name;
  }

  // Validate account
  const account = await requireOwnedAccount(userId, input.accountId);

  // Validate category if provided
  let categoryObjectId: Types.ObjectId | null = null;
  if (input.categoryId) {
    const category = await requireOwnedCategory(userId, input.categoryId);
    categoryObjectId = category._id;
  }

  return withTransaction(async (session) => {
    const [doc] = await MoneyOwedModel.create(
      [
        {
          userId: userObjectId,
          personId,
          direction: input.direction,
          type: input.type,
          originalAmount: input.amount,
          remainingAmount: input.amount,
          purpose: input.purpose.trim(),
          categoryId: categoryObjectId,
          accountId: account._id,
          dueDate: input.dueDate ?? null,
          status: 'active',
          note: input.note?.trim() ?? '',
        },
      ],
      { session },
    );

    if (!doc) throw ApiError.internal('Could not create obligation');

    // Account balance impact:
    // If someone owes me money (loan, paid_for), money was spent from my account: -amount
    // If I owe someone (borrowed), money entered my account: +amount
    const delta = input.direction === 'owed_to_me' ? -input.amount : input.amount;
    await adjustBalance(account._id, delta, session);

    return toPublicMoneyOwed(doc, personName);
  });
}

/**
 * Records a repayment for an obligation.
 *
 * Rules:
 * - Repayment cannot exceed remaining amount.
 * - If direction is "owed_to_me", user gets paid back -> account balance increases by +amount.
 * - If direction is "i_owe", user pays back -> account balance decreases by -amount.
 * - Neither is treated as income or personal expense.
 * - When remaining reaches 0, status transitions to 'settled'.
 */
export async function recordRepayment(
  userId: string,
  obligationId: string,
  input: RecordRepaymentInput,
): Promise<{ obligation: PublicMoneyOwed; repayment: PublicRepayment }> {
  const userObjectId = new Types.ObjectId(userId);
  await requireOwnedAccount(userId, input.accountId);

  return withTransaction(async (session) => {
    const obligation = await requireOwnedObligation(userId, obligationId, session);

    if (obligation.status !== 'active') {
      throw ApiError.badRequest(`Cannot repay an obligation that is ${obligation.status}`);
    }

    if (input.amount > obligation.remainingAmount) {
      throw ApiError.badRequest(
        `Repayment amount (₹${(input.amount / 100).toFixed(2)}) cannot exceed remaining amount (₹${(obligation.remainingAmount / 100).toFixed(2)})`,
      );
    }

    const newRemaining = obligation.remainingAmount - input.amount;
    obligation.remainingAmount = newRemaining;
    if (newRemaining === 0) {
      obligation.status = 'settled';
    }

    await obligation.save({ session });

    const [repaymentDoc] = await RepaymentModel.create(
      [
        {
          userId: userObjectId,
          moneyOwedId: obligation._id,
          personId: obligation.personId,
          amount: input.amount,
          accountId: new Types.ObjectId(input.accountId),
          date: input.date,
          note: input.note?.trim() ?? '',
        },
      ],
      { session },
    );

    // Balance impact:
    // If "owed_to_me" (person repays user) -> user gets cash: +amount
    // If "i_owe" (user repays person) -> user pays cash: -amount
    const delta = obligation.direction === 'owed_to_me' ? input.amount : -input.amount;
    await adjustBalance(new Types.ObjectId(input.accountId), delta, session);

    if (!repaymentDoc) throw ApiError.internal('Could not record repayment');

    const person = await PersonModel.findById(obligation.personId).session(session ?? null);

    return {
      obligation: toPublicMoneyOwed(obligation, person?.name ?? ''),
      repayment: toPublicRepayment(repaymentDoc as unknown as RepaymentDoc),
    };
  });
}

export async function writeOffObligation(
  userId: string,
  obligationId: string,
  note?: string,
): Promise<PublicMoneyOwed> {
  const obligation = await requireOwnedObligation(userId, obligationId);

  if (obligation.status === 'settled') {
    throw ApiError.badRequest('Cannot write off an already settled obligation');
  }

  obligation.status = 'written_off';
  if (note && note.trim().length > 0) {
    obligation.note = obligation.note
      ? `${obligation.note} | Written off: ${note.trim()}`
      : `Written off: ${note.trim()}`;
  }

  await obligation.save();
  const person = await PersonModel.findById(obligation.personId);
  return toPublicMoneyOwed(obligation, person?.name ?? '');
}

export async function updateMoneyOwed(
  userId: string,
  obligationId: string,
  patch: UpdateMoneyOwedInput,
): Promise<PublicMoneyOwed> {
  const obligation = await requireOwnedObligation(userId, obligationId);

  if (patch.purpose !== undefined) obligation.purpose = patch.purpose.trim();
  if (patch.dueDate !== undefined) obligation.dueDate = patch.dueDate;
  if (patch.note !== undefined) obligation.note = patch.note.trim();

  await obligation.save();
  const person = await PersonModel.findById(obligation.personId);
  return toPublicMoneyOwed(obligation, person?.name ?? '');
}

export async function deleteMoneyOwed(
  userId: string,
  obligationId: string,
): Promise<{ deleted: boolean }> {
  const obligation = await requireOwnedObligation(userId, obligationId);

  // Safety check: Cannot delete if repayments exist
  const repaymentCount = await RepaymentModel.countDocuments({
    userId: new Types.ObjectId(userId),
    moneyOwedId: obligation._id,
  });

  if (repaymentCount > 0) {
    throw ApiError.badRequest(
      'Cannot delete obligation with recorded repayments. Use write-off if uncollectible.',
    );
  }

  // Also prevent deleting active obligation without explicit write-off or settle
  if (obligation.status === 'active') {
    throw ApiError.badRequest(
      'Active obligations must be settled or written off rather than deleted.',
    );
  }

  await obligation.deleteOne();
  return { deleted: true };
}

export async function listMoneyOwed(
  userId: string,
  query: ListMoneyOwedQuery,
): Promise<PublicMoneyOwed[]> {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

  if (query.personId) filter.personId = new Types.ObjectId(query.personId);
  if (query.direction) filter.direction = query.direction;
  if (query.status) filter.status = query.status;

  const obligations = await MoneyOwedModel.find(filter).sort({ createdAt: -1 }).lean();

  // Populate person names
  const personIds = Array.from(new Set(obligations.map((o) => String(o.personId))));
  const people = await PersonModel.find({ _id: { $in: personIds } }, 'name').lean();
  const personNameMap = new Map(people.map((p) => [String(p._id), p.name]));

  return obligations.map((o) =>
    toPublicMoneyOwed(o as MoneyOwedDoc, personNameMap.get(String(o.personId)) ?? ''),
  );
}

export async function getMoneyOwed(userId: string, obligationId: string): Promise<PublicMoneyOwed> {
  const obligation = await requireOwnedObligation(userId, obligationId);
  const person = await PersonModel.findById(obligation.personId);
  return toPublicMoneyOwed(obligation, person?.name ?? '');
}

export async function listRepayments(
  userId: string,
  moneyOwedId: string,
): Promise<PublicRepayment[]> {
  await requireOwnedObligation(userId, moneyOwedId);

  const repayments = await RepaymentModel.find({
    userId: new Types.ObjectId(userId),
    moneyOwedId: new Types.ObjectId(moneyOwedId),
  })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  return repayments.map((r) => toPublicRepayment(r as RepaymentDoc));
}
