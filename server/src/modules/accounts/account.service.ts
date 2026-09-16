import { Types, type ClientSession } from 'mongoose';

import { ApiError } from '../../lib/ApiError';
import { TransactionModel } from '../transactions/transaction.model';

import { AccountModel, type Account } from './account.model';
import type { CreateAccountInput, UpdateAccountInput } from './account.schemas';

export type PublicAccount = {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  icon: string;
  color: string;
  institution?: string;
  last4?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type AccountLike = Account & { _id: Types.ObjectId; createdAt?: Date; updatedAt?: Date };

export function toPublicAccount(account: AccountLike): PublicAccount {
  return {
    id: String(account._id),
    name: account.name,
    type: account.type,
    balance: account.balance,
    currency: account.currency,
    icon: account.icon,
    color: account.color,
    ...(account.institution ? { institution: account.institution } : {}),
    ...(account.last4 ? { last4: account.last4 } : {}),
    isActive: account.isActive,
    createdAt: (account.createdAt ?? new Date()).toISOString(),
    updatedAt: (account.updatedAt ?? new Date()).toISOString(),
  };
}

/**
 * Loads an account that belongs to this user, or throws.
 *
 * The `userId` in the filter is the whole access-control story for this module.
 * It is not a belt-and-braces check on top of something else — it *is* the check,
 * which is why every read and write goes through a query that carries it rather
 * than through `findById` plus an `if`. A missing row and someone else's row
 * produce the same 404, so the endpoint cannot be used to probe for ids.
 */
export async function requireOwnedAccount(
  userId: string,
  accountId: string,
  session?: ClientSession,
) {
  const account = await AccountModel.findOne({
    _id: accountId,
    userId: new Types.ObjectId(userId),
  }).session(session ?? null);

  if (!account) throw ApiError.notFound('Account not found', { accountId });
  return account;
}

export async function listAccounts(
  userId: string,
  includeArchived: boolean,
): Promise<PublicAccount[]> {
  const accounts = await AccountModel.find({
    userId: new Types.ObjectId(userId),
    ...(includeArchived ? {} : { isActive: true }),
  })
    .sort({ isActive: -1, createdAt: 1 })
    .lean();

  return accounts.map(toPublicAccount);
}

export async function getAccount(userId: string, accountId: string): Promise<PublicAccount> {
  return toPublicAccount(await requireOwnedAccount(userId, accountId));
}

export async function createAccount(
  userId: string,
  input: CreateAccountInput,
): Promise<PublicAccount> {
  const duplicate = await AccountModel.exists({
    userId: new Types.ObjectId(userId),
    name: input.name,
    isActive: true,
  });
  if (duplicate) throw ApiError.conflict(`You already have an account called "${input.name}"`);

  const account = await AccountModel.create({ ...input, userId: new Types.ObjectId(userId) });
  return toPublicAccount(account);
}

export async function updateAccount(
  userId: string,
  accountId: string,
  patch: UpdateAccountInput,
): Promise<PublicAccount> {
  const account = await requireOwnedAccount(userId, accountId);

  if (patch.name && patch.name !== account.name) {
    const duplicate = await AccountModel.exists({
      userId: new Types.ObjectId(userId),
      name: patch.name,
      isActive: true,
      _id: { $ne: account._id },
    });
    if (duplicate) throw ApiError.conflict(`You already have an account called "${patch.name}"`);
  }

  // `balance` is deliberately absent from the update schema. See the note there.
  Object.assign(account, patch);
  await account.save();

  return toPublicAccount(account);
}

/**
 * Archives an account, or deletes it outright when nothing references it.
 *
 * Deleting an account with transactions behind it would orphan every one of them
 * and silently change the totals for months that are already closed. Archiving
 * keeps the history intact and just takes the account out of the pickers, which is
 * what "delete" means to someone who has stopped using a card.
 */
export async function deleteAccount(
  userId: string,
  accountId: string,
): Promise<{ deleted: boolean; archived: boolean }> {
  const account = await requireOwnedAccount(userId, accountId);

  const referenced = await TransactionModel.exists({
    userId: new Types.ObjectId(userId),
    $or: [{ accountId: account._id }, { destinationAccountId: account._id }],
  });

  if (!referenced) {
    await account.deleteOne();
    return { deleted: true, archived: false };
  }

  account.isActive = false;
  await account.save();
  return { deleted: false, archived: true };
}

/**
 * Applies a signed delta to an account balance, inside the caller's transaction.
 *
 * `$inc` rather than read-modify-write on purpose: two transactions saved at the
 * same moment would both read the same starting balance and the second would
 * overwrite the first's effect. `$inc` is atomic in the database, so concurrent
 * writes add up instead of racing.
 */
export async function adjustBalance(
  accountId: Types.ObjectId,
  delta: number,
  session?: ClientSession,
): Promise<void> {
  if (delta === 0) return;
  await AccountModel.updateOne({ _id: accountId }, { $inc: { balance: delta } }, { session });
}
