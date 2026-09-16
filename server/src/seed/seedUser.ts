import { Types, type ClientSession } from 'mongoose';

import { logger } from '../config/logger';
import { AccountModel } from '../modules/accounts/account.model';
import { CategoryModel } from '../modules/categories/category.model';
import { UserModel } from '../modules/users/user.model';

import { DEFAULT_ACCOUNTS, flattenDefaults } from './defaultCategories';

/**
 * Gives a brand-new account the categories and accounts it needs to be usable.
 *
 * Copied per user rather than shared as global rows, which costs ~110 small
 * documents a head and buys the thing that matters: someone can rename "Swiggy" to
 * "Swiggy (office)" or archive the whole Alcohol group without it affecting anyone
 * else. A shared read-only default set would make every one of those edits a
 * special case.
 *
 * Idempotent — `seededAt` gates it, so a retried registration cannot double up.
 */
export async function seedUserDefaults(
  userId: Types.ObjectId,
  currency: string,
  session?: ClientSession,
): Promise<void> {
  const categories = flattenDefaults().map((category) => ({ ...category, userId }));

  await CategoryModel.insertMany(categories, { session, ordered: false });

  await AccountModel.insertMany(
    DEFAULT_ACCOUNTS.map((account, index) => ({
      ...account,
      userId,
      currency,
      balance: 0,
      isActive: true,
      createdAt: new Date(Date.now() + index),
    })),
    { session, ordered: false },
  );

  await UserModel.updateOne({ _id: userId }, { $set: { seededAt: new Date() } }, { session });

  logger.info({ userId: String(userId), categories: categories.length }, 'seeded user defaults');
}
