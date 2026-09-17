import { Types, type ClientSession, type FilterQuery } from 'mongoose';

import { ApiError } from '../../lib/ApiError';
import { pageMeta, type PageMeta } from '../../lib/pagination';
import { withTransaction } from '../../lib/session';
import { zoneOrDefault } from '../../lib/time';
import { adjustBalance, requireOwnedAccount } from '../accounts/account.service';
import { evaluateBudgets } from '../budgets/budget.service';
import { rememberMerchant } from '../merchants/merchant.service';
import { detachFromTransaction } from '../receipts/receipt.service';
import { requireOwnedCategory } from '../categories/category.service';
import { UserModel } from '../users/user.model';

import {
  TransactionModel,
  type PaymentMethod,
  type Transaction,
  type TransactionType,
} from './transaction.model';
import type {
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateTransactionInput,
} from './transaction.schemas';

export type PublicTransaction = {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string | null;
  accountId: string;
  destinationAccountId: string | null;
  merchant: string;
  description: string;
  paymentMethod: PaymentMethod;
  date: string;
  createdAt: string;
  updatedAt: string;
};

type TransactionLike = Transaction & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

export function toPublicTransaction(transaction: TransactionLike): PublicTransaction {
  return {
    id: String(transaction._id),
    type: transaction.type as TransactionType,
    amount: transaction.amount,
    categoryId: transaction.categoryId ? String(transaction.categoryId) : null,
    accountId: String(transaction.accountId),
    destinationAccountId: transaction.destinationAccountId
      ? String(transaction.destinationAccountId)
      : null,
    merchant: transaction.merchant ?? '',
    description: transaction.description ?? '',
    paymentMethod: (transaction.paymentMethod ?? 'upi') as PaymentMethod,
    date: transaction.date.toISOString(),
    createdAt: (transaction.createdAt ?? new Date()).toISOString(),
    updatedAt: (transaction.updatedAt ?? new Date()).toISOString(),
  };
}

/**
 * How one transaction moves money, as a list of (account, signed paise) pairs.
 *
 * This is the single definition of what each type means to a balance, and both
 * the create path and the edit path go through it — an edit applies the negation
 * of the old effect and then the new one. Writing the arithmetic twice is how the
 * two paths drift, and a balance that is right on create and wrong on edit is the
 * hardest kind of bug to notice.
 *
 * A transfer debits one account and credits another and touches nothing else. It
 * is not an expense and not income, so it contributes nothing to either total —
 * HDFC → Cash for ₹10,000 leaves the month's spending exactly where it was.
 */
function balanceEffects(transaction: {
  type: TransactionType;
  amount: number;
  accountId: Types.ObjectId;
  destinationAccountId?: Types.ObjectId | null;
}): { accountId: Types.ObjectId; delta: number }[] {
  switch (transaction.type) {
    case 'expense':
      return [{ accountId: transaction.accountId, delta: -transaction.amount }];
    case 'income':
      return [{ accountId: transaction.accountId, delta: transaction.amount }];
    case 'transfer':
      if (!transaction.destinationAccountId) {
        throw ApiError.internal('Transfer without a destination account');
      }
      return [
        { accountId: transaction.accountId, delta: -transaction.amount },
        { accountId: transaction.destinationAccountId, delta: transaction.amount },
      ];
  }
}

async function applyEffects(
  effects: { accountId: Types.ObjectId; delta: number }[],
  session?: ClientSession,
): Promise<void> {
  for (const effect of effects) {
    await adjustBalance(effect.accountId, effect.delta, session);
  }
}

function invert(effects: { accountId: Types.ObjectId; delta: number }[]) {
  return effects.map((effect) => ({ ...effect, delta: -effect.delta }));
}

/**
 * Checks that every account and category a write names belongs to this user.
 *
 * Without it, a client could post an expense against someone else's account id and
 * move their balance. The ids are validated as *owned*, not merely as well-formed —
 * that distinction is the whole point.
 */
async function resolveReferences(
  userId: string,
  input: {
    type: TransactionType;
    accountId: string;
    destinationAccountId?: string;
    categoryId?: string;
  },
  session?: ClientSession,
): Promise<{
  accountId: Types.ObjectId;
  destinationAccountId: Types.ObjectId | null;
  categoryId: Types.ObjectId | null;
}> {
  const account = await requireOwnedAccount(userId, input.accountId, session);

  let destination: Types.ObjectId | null = null;
  if (input.type === 'transfer') {
    if (!input.destinationAccountId) {
      throw ApiError.badRequest('Pick an account to transfer into', [
        { field: 'destinationAccountId', message: 'Required for a transfer' },
      ]);
    }
    if (input.destinationAccountId === input.accountId) {
      throw ApiError.badRequest('Transfer between two different accounts', [
        { field: 'destinationAccountId', message: 'Pick a different account' },
      ]);
    }
    destination = (await requireOwnedAccount(userId, input.destinationAccountId, session))._id;
  }

  let categoryId: Types.ObjectId | null = null;
  if (input.type !== 'transfer') {
    if (!input.categoryId) {
      throw ApiError.badRequest('Pick a category', [
        { field: 'categoryId', message: 'Required' },
      ]);
    }
    const category = await requireOwnedCategory(userId, input.categoryId, session);

    // An income filed under "Petrol" is a chart nobody can read. The picker never
    // offers the wrong list, so this only catches a client bug — but it catches it
    // before it reaches the data.
    if (category.type !== input.type) {
      throw ApiError.badRequest(`"${category.name}" is not a ${input.type} category`, [
        { field: 'categoryId', message: `Pick a ${input.type} category` },
      ]);
    }
    if (!category.isActive) {
      throw ApiError.badRequest(`"${category.name}" has been archived`, [
        { field: 'categoryId', message: 'Pick an active category' },
      ]);
    }
    categoryId = category._id;
  }

  return { accountId: account._id, destinationAccountId: destination, categoryId };
}

export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
): Promise<PublicTransaction> {
  return withTransaction(async (session) => {
    const refs = await resolveReferences(
      userId,
      {
        type: input.type,
        accountId: input.accountId,
        destinationAccountId: input.type === 'transfer' ? input.destinationAccountId : undefined,
        categoryId: input.type === 'transfer' ? undefined : input.categoryId,
      },
      session,
    );

    const [transaction] = await TransactionModel.create(
      [
        {
          userId: new Types.ObjectId(userId),
          type: input.type,
          amount: input.amount,
          accountId: refs.accountId,
          destinationAccountId: refs.destinationAccountId,
          categoryId: refs.categoryId,
          merchant: input.merchant,
          description: input.description,
          paymentMethod: input.paymentMethod,
          date: input.date,
        },
      ],
      { session, ordered: true },
    );

    if (!transaction) throw ApiError.internal('Could not save the transaction');

    await applyEffects(balanceEffects(transaction), session);

    return toPublicTransaction(transaction);
  }).then((created) => {
    afterLedgerChange(userId, input.date);
    // What someone actually saved is the only confirmation that exists. Accepting
    // a suggestion and overriding one both arrive here, and both are the user
    // telling us where this merchant belongs.
    void rememberMerchant(userId, input.merchant, created.categoryId, {
      accountId: input.accountId,
      paymentMethod: input.paymentMethod,
    });
    return created;
  });
}

/**
 * Runs the budget check for the month a write landed in.
 *
 * Deliberately not awaited and deliberately outside the database transaction: an
 * alert that fails must not roll back the expense that triggered it, and nobody
 * should wait on an aggregation to see their own transaction saved. `raise`
 * swallows its own errors, so the floating promise cannot reject.
 */
function afterLedgerChange(userId: string, ...dates: (Date | string | undefined)[]): void {
  const months = new Set<number>();
  for (const raw of dates) {
    if (!raw) continue;
    const date = raw instanceof Date ? raw : new Date(raw);
    if (isNaN(date.getTime())) continue;
    // One evaluation per distinct month, so moving a transaction across a
    // boundary re-checks both ends without checking either twice.
    const key = date.getUTCFullYear() * 12 + date.getUTCMonth();
    if (months.has(key)) continue;
    months.add(key);
    void evaluateBudgets(userId, date);
  }
}

export async function getTransaction(
  userId: string,
  transactionId: string,
): Promise<PublicTransaction> {
  const transaction = await TransactionModel.findOne({
    _id: transactionId,
    userId: new Types.ObjectId(userId),
  }).lean();

  if (!transaction) throw ApiError.notFound('Transaction not found', { transactionId });
  return toPublicTransaction(transaction);
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  patch: UpdateTransactionInput,
): Promise<PublicTransaction> {
  return withTransaction(async (session) => {
    const transaction = await TransactionModel.findOne({
      _id: transactionId,
      userId: new Types.ObjectId(userId),
    }).session(session ?? null);

    if (!transaction) throw ApiError.notFound('Transaction not found', { transactionId });

    const type = transaction.type as TransactionType;

    if (type !== 'transfer' && patch.destinationAccountId) {
      throw ApiError.badRequest('Only a transfer has a destination account', [
        { field: 'destinationAccountId', message: 'Not valid for this transaction' },
      ]);
    }
    if (type === 'transfer' && patch.categoryId) {
      throw ApiError.badRequest('A transfer between your own accounts has no category', [
        { field: 'categoryId', message: 'Not valid for a transfer' },
      ]);
    }

    // Undo what this transaction currently does to the balances, in full, before
    // anything is changed. The new effect is applied from the updated document, so
    // the two never have to be reconciled field by field.
    const before = invert(balanceEffects(transaction));
    const previousDate = transaction.date;

    const refs = await resolveReferences(
      userId,
      {
        type,
        accountId: patch.accountId ?? String(transaction.accountId),
        destinationAccountId:
          type === 'transfer'
            ? (patch.destinationAccountId ?? String(transaction.destinationAccountId))
            : undefined,
        categoryId:
          type === 'transfer'
            ? undefined
            : (patch.categoryId ?? String(transaction.categoryId)),
      },
      session,
    );

    if (patch.amount !== undefined) transaction.amount = patch.amount;
    if (patch.merchant !== undefined) transaction.merchant = patch.merchant;
    if (patch.description !== undefined) transaction.description = patch.description;
    if (patch.paymentMethod !== undefined) transaction.paymentMethod = patch.paymentMethod;
    if (patch.date !== undefined) transaction.date = patch.date;
    transaction.accountId = refs.accountId;
    transaction.destinationAccountId = refs.destinationAccountId;
    transaction.categoryId = refs.categoryId;

    await transaction.save({ session });

    await applyEffects([...before, ...balanceEffects(transaction)], session);

    // An edit is the strongest correction there is: someone looked at what was
    // filed and changed it. Recording it here is what makes "remember my
    // corrections" true rather than aspirational.
    void rememberMerchant(userId, transaction.merchant, transaction.categoryId, {
      accountId: transaction.accountId,
      paymentMethod: transaction.paymentMethod,
    });

    // Both ends: an edit that moved the date out of September and into October
    // can take September back under its cap and push October over it.
    afterLedgerChange(userId, previousDate, transaction.date);

    return toPublicTransaction(transaction);
  });
}

export async function deleteTransaction(userId: string, transactionId: string): Promise<void> {
  await withTransaction(async (session) => {
    const transaction = await TransactionModel.findOne({
      _id: transactionId,
      userId: new Types.ObjectId(userId),
    }).session(session ?? null);

    if (!transaction) throw ApiError.notFound('Transaction not found', { transactionId });

    const when = transaction.date;
    await applyEffects(invert(balanceEffects(transaction)), session);
    await transaction.deleteOne({ session });

    // The image outlives the entry it was attached to. Deleting someone's
    // photograph because they corrected a typo in the amount would be a surprise,
    // and an unpleasant one; the receipt simply goes back to being unattached.
    void detachFromTransaction(userId, transactionId);

    // Deleting can take a budget back under its cap; the alert for that month is
    // already recorded and stays, but the next write should re-evaluate honestly.
    afterLedgerChange(userId, when);
  });
}

function buildFilter(userId: string, query: ListTransactionsQuery): FilterQuery<Transaction> {
  const filter: FilterQuery<Transaction> = { userId: new Types.ObjectId(userId) };

  if (query.type) filter.type = query.type;
  if (query.categoryId) filter.categoryId = new Types.ObjectId(query.categoryId);
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;

  if (query.accountId) {
    // A transfer shows up in both accounts it touches, which is what someone
    // filtering by "HDFC" expects to see — money leaving is as much a part of that
    // account's story as money arriving.
    const id = new Types.ObjectId(query.accountId);
    filter.$or = [{ accountId: id }, { destinationAccountId: id }];
  }

  if (query.from || query.to) {
    filter.date = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }

  if (query.minAmount !== undefined || query.maxAmount !== undefined) {
    filter.amount = {
      ...(query.minAmount !== undefined ? { $gte: query.minAmount } : {}),
      ...(query.maxAmount !== undefined ? { $lte: query.maxAmount } : {}),
    };
  }

  if (query.q) {
    // Case-insensitive substring rather than the text index: people search for
    // "swig" and expect Swiggy, which a stemmed word-boundary search does not give
    // them. Escaped so a stray "(" in the box is a search, not a 500.
    const pattern = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const search = [{ merchant: pattern }, { description: pattern }];
    filter.$and = [...(filter.$and ?? []), { $or: search }];
    if (filter.$or) {
      // Two independent $or clauses cannot both live at the top level, so the
      // account filter moves into $and beside the search.
      filter.$and.push({ $or: filter.$or });
      delete filter.$or;
    }
  }

  return filter;
}

const SORTS: Record<string, Record<string, 1 | -1>> = {
  date: { date: 1, _id: 1 },
  '-date': { date: -1, _id: -1 },
  amount: { amount: 1, _id: 1 },
  '-amount': { amount: -1, _id: -1 },
  createdAt: { createdAt: 1, _id: 1 },
  '-createdAt': { createdAt: -1, _id: -1 },
};

export async function listTransactions(
  userId: string,
  query: ListTransactionsQuery,
): Promise<{ transactions: PublicTransaction[]; meta: PageMeta }> {
  const filter = buildFilter(userId, query);
  // `_id` is the tie-break on every sort. Without it two transactions on the same
  // date can swap places between page 1 and page 2, and a row is shown twice or
  // never — the classic infinite-scroll duplicate.
  const sort = SORTS[query.sort] ?? SORTS['-date']!;

  const [rows, total] = await Promise.all([
    TransactionModel.find(filter)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    TransactionModel.countDocuments(filter),
  ]);

  return {
    transactions: rows.map(toPublicTransaction),
    meta: pageMeta(query.page, query.limit, total),
  };
}

export type Summary = {
  from: string | null;
  to: string | null;
  income: number;
  expense: number;
  /** income − expense. Transfers are absent from both, so they cannot move it. */
  net: number;
  transferred: number;
  count: number;
  byCategory: { categoryId: string; amount: number; count: number }[];
};

/**
 * Totals for the period, for the cards the app already shows.
 *
 * Transfers are excluded from `income` and `expense` at the `$match`, not filtered
 * out afterwards — moving ₹10,000 from HDFC to Cash is not spending and must not
 * appear as any. They are reported separately as `transferred` so the number is
 * visible rather than merely missing.
 */
export async function getSummary(
  userId: string,
  range: { from?: Date; to?: Date },
): Promise<Summary> {
  const match: FilterQuery<Transaction> = { userId: new Types.ObjectId(userId) };
  if (range.from || range.to) {
    match.date = {
      ...(range.from ? { $gte: range.from } : {}),
      ...(range.to ? { $lte: range.to } : {}),
    };
  }

  const [totals, byCategory] = await Promise.all([
    TransactionModel.aggregate<{ _id: string; amount: number; count: number }>([
      { $match: match },
      { $group: { _id: '$type', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    TransactionModel.aggregate<{ _id: Types.ObjectId; amount: number; count: number }>([
      { $match: { ...match, type: 'expense' } },
      { $group: { _id: '$categoryId', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
  ]);

  const find = (type: string) => totals.find((row) => row._id === type);

  return {
    from: range.from?.toISOString() ?? null,
    to: range.to?.toISOString() ?? null,
    income: find('income')?.amount ?? 0,
    expense: find('expense')?.amount ?? 0,
    net: (find('income')?.amount ?? 0) - (find('expense')?.amount ?? 0),
    transferred: find('transfer')?.amount ?? 0,
    count: totals.reduce((sum, row) => sum + row.count, 0),
    byCategory: byCategory
      .filter((row) => row._id)
      .map((row) => ({
        categoryId: String(row._id),
        amount: row.amount,
        count: row.count,
      })),
  };
}

export type DailySpend = {
  /** `YYYY-MM-DD` in the user's zone. */
  date: string;
  expense: number;
  income: number;
  count: number;
};

/**
 * Spending per day, bucketed in the user's own zone.
 *
 * The grouping happens in Mongo via `$dateToString` with a `timezone`, not in
 * Node after fetching rows. That matters twice over: a month of transactions
 * never crosses the wire just to be counted, and the day boundary is the user's
 * local midnight rather than UTC — a 10pm IST purchase belongs to that evening,
 * not to the next morning.
 *
 * Days with nothing spent are absent rather than zero-filled; the calendar knows
 * which days exist and the caller has fewer rows to carry.
 */
export async function getDailySpend(
  userId: string,
  range: { from: Date; to: Date },
): Promise<DailySpend[]> {
  const user = await UserModel.findById(userId).select('timezone').lean();
  const timezone = zoneOrDefault(user?.timezone);

  const rows = await TransactionModel.aggregate<{
    _id: string;
    expense: number;
    income: number;
    count: number;
  }>([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        date: { $gte: range.from, $lte: range.to },
        // Transfers move money without spending it, so a day whose only activity
        // was an ATM withdrawal must read as a day with no spending.
        type: { $in: ['expense', 'income'] },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone } },
        expense: {
          $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] },
        },
        income: {
          $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((row) => ({
    date: row._id,
    expense: row.expense,
    income: row.income,
    count: row.count,
  }));
}
