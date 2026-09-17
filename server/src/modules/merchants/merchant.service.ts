import { Types } from 'mongoose';

import { logger } from '../../config/logger';
import { CategoryModel } from '../categories/category.model';

import { MerchantMemoryModel } from './merchantMemory.model';

/**
 * Merchant memory: the app learning one person's filing habits.
 *
 * This is the layer that makes the second Swiggy order instant and the twentieth
 * invisible. It is also, deliberately, the *first* thing consulted when a category
 * is suggested — ahead of the brand table and well ahead of the model. What this
 * user did last time is better evidence than what a language model thinks people
 * generally do, it costs one indexed lookup instead of a network round trip, and
 * it is the only one of the three that can learn.
 */

/**
 * Reduces a merchant name to something that matches across how people type.
 *
 * `IndianOil`, `INDIAN OIL`, `Indian Oil #4412` and `INDIANOIL-BLR` all have to
 * land on the same key or the memory never accumulates — it would hold twenty
 * rows of one each and never reach a confident answer.
 *
 * Trailing reference numbers go because payment apps append them
 * (`SWIGGY*ORDER 8821`), and they are the single most common reason two records of
 * the same shop look different.
 */
export function merchantKey(merchant: string): string {
  return (
    merchant
      .toLowerCase()
      .normalize('NFKD')
      // Anything that is not a letter or a digit is a separator, not a character:
      // `cult.fit`, `cult fit` and `cult-fit` are one shop.
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      // A long digit run is a reference, not a name. Short ones stay, because
      // they are often part of one — `7 Eleven`, `24 Seven`. This has to happen
      // while the separators are still spaces, or there are no word boundaries
      // left to anchor to.
      .replace(/\b\d{4,}\b/g, ' ')
      // Then the spaces go too. `IndianOil`, `INDIAN OIL` and `indian-oil` are
      // one shop and have to reach one key, or the memory for it is split across
      // three rows that each never reach a confident count.
      .replace(/\s+/g, '')
      .slice(0, 120)
  );
}

/**
 * Records that this user filed this merchant under this category.
 *
 * Called after a transaction is written, never before: the signal is what someone
 * actually saved, which is the only moment they have confirmed anything. Accepting
 * a suggestion and correcting one produce the same call, because both are the user
 * telling us where this belongs.
 *
 * Failures are swallowed. Learning is a nicety; refusing to record an expense
 * because a statistics row would not upsert is not a trade anyone would make.
 */
export async function rememberMerchant(
  userId: string,
  merchant: string | undefined | null,
  categoryId: Types.ObjectId | string | null | undefined,
  options?: {
    accountId?: Types.ObjectId | string | null;
    paymentMethod?: string | null;
  },
): Promise<void> {
  const label = (merchant ?? '').trim();
  const key = merchantKey(label);
  if (!key || !categoryId) return;

  const $set: Record<string, unknown> = {
    merchantLabel: label.slice(0, 120),
    lastUsedAt: new Date(),
  };

  if (options?.accountId) {
    $set.preferredAccountId = new Types.ObjectId(String(options.accountId));
  }
  if (options?.paymentMethod) {
    $set.preferredPaymentMethod = options.paymentMethod;
  }

  try {
    await MerchantMemoryModel.updateOne(
      {
        userId: new Types.ObjectId(userId),
        merchantKey: key,
        categoryId: new Types.ObjectId(String(categoryId)),
      },
      {
        $inc: { count: 1 },
        $set,
      },
      { upsert: true },
    );
  } catch (error) {
    logger.warn({ err: error, merchantKey: key }, 'could not record a merchant memory');
  }
}

export type RecalledMerchant = {
  categoryId: string;
  categoryName: string;
  /** How many times this user has filed this merchant here. */
  count: number;
  merchantLabel: string;
  /** The account this merchant was last filed under, if any. */
  preferredAccountId: string | null;
  /** The payment method this merchant was last filed with, if any. */
  preferredPaymentMethod: string | null;
};

/**
 * What this user usually files this merchant under.
 *
 * Highest count wins; a tie goes to whichever was used more recently. Returns null
 * rather than a weak guess — an empty memory is a fact, and pretending otherwise
 * would mean the merchant table and the model never get a turn.
 *
 * The category is re-read rather than trusted from the memory row, so a category
 * that has since been archived or deleted cannot be suggested. Memory is a hint
 * about the past, not a licence to name something that is no longer there.
 */
export async function recallMerchant(
  userId: string,
  merchant: string,
): Promise<RecalledMerchant | null> {
  const key = merchantKey(merchant);
  if (!key) return null;

  const rows = await MerchantMemoryModel.find({
    userId: new Types.ObjectId(userId),
    merchantKey: key,
  })
    .sort({ count: -1, lastUsedAt: -1 })
    .limit(5)
    .lean();

  if (rows.length === 0) return null;

  for (const row of rows) {
    const category = await CategoryModel.findOne({
      _id: row.categoryId,
      isActive: true,
      $or: [{ userId: null }, { userId: new Types.ObjectId(userId) }],
    })
      .select('name')
      .lean();

    if (category) {
      return {
        categoryId: String(category._id),
        categoryName: category.name,
        count: row.count,
        merchantLabel: row.merchantLabel,
        preferredAccountId: row.preferredAccountId ? String(row.preferredAccountId) : null,
        preferredPaymentMethod: (row as any).preferredPaymentMethod ?? null,
      };
    }
  }

  return null;
}

/**
 * Merchant names this user has used, for the entry field's autocomplete.
 *
 * Ordered by how often they appear, so the shops someone actually goes to come
 * first rather than the alphabet.
 */
export async function suggestMerchants(
  userId: string,
  query: string,
  limit = 8,
): Promise<{ merchant: string; categoryId: string; categoryName: string }[]> {
  const key = merchantKey(query);

  const rows = await MerchantMemoryModel.aggregate<{
    _id: string;
    merchantLabel: string;
    categoryId: Types.ObjectId;
    total: number;
  }>([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        ...(key ? { merchantKey: { $regex: `^${escapeRegex(key)}` } } : {}),
      },
    },
    { $sort: { count: -1, lastUsedAt: -1 } },
    {
      $group: {
        _id: '$merchantKey',
        merchantLabel: { $first: '$merchantLabel' },
        categoryId: { $first: '$categoryId' },
        total: { $sum: '$count' },
      },
    },
    { $sort: { total: -1 } },
    { $limit: limit },
  ]);

  if (rows.length === 0) return [];

  const categories = await CategoryModel.find({ _id: { $in: rows.map((row) => row.categoryId) } })
    .select('name')
    .lean();
  const names = new Map(categories.map((entry) => [String(entry._id), entry.name]));

  return rows
    .filter((row) => names.has(String(row.categoryId)))
    .map((row) => ({
      merchant: row.merchantLabel,
      categoryId: String(row.categoryId),
      categoryName: names.get(String(row.categoryId)) ?? '',
    }));
}

/** Forgets one merchant entirely. The way out of a memory that learned wrongly. */
export async function forgetMerchant(userId: string, merchant: string): Promise<number> {
  const key = merchantKey(merchant);
  if (!key) return 0;

  const result = await MerchantMemoryModel.deleteMany({
    userId: new Types.ObjectId(userId),
    merchantKey: key,
  });
  return result.deletedCount ?? 0;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
