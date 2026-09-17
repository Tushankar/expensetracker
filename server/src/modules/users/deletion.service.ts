import { Types } from 'mongoose';

import { logger } from '../../config/logger';
import { ApiError } from '../../lib/ApiError';
import { destroyUpload } from '../../lib/cloudinary';
import { verifyPassword } from '../../lib/password';
import { AccountModel } from '../accounts/account.model';
import { AiMessageModel } from '../ai/aiMessage.model';
import { RefreshTokenModel } from '../auth/refreshToken.model';
import { BudgetModel } from '../budgets/budget.model';
import { CategoryModel } from '../categories/category.model';
import { MerchantMemoryModel } from '../merchants/merchantMemory.model';
import { NotificationModel } from '../notifications/notification.model';
import { ReceiptModel } from '../receipts/receipt.model';
import { RecurringModel } from '../recurring/recurring.model';
import { TransactionModel } from '../transactions/transaction.model';

import { UserModel } from './user.model';

/**
 * Deleting an account, and meaning it.
 *
 * Not a soft delete, not a flag, not a thirty-day grace period during which a
 * finance company still holds a year of someone's spending. When a person asks to
 * be forgotten the only honest implementation removes the rows — including the
 * receipt images, which live on a third party and would otherwise outlive
 * everything that pointed at them.
 *
 * The password is required for the same reason a bank asks: this is the one call
 * in the API that cannot be undone, and a stolen access token should not be
 * enough to destroy someone's records.
 */

export type DeletionSummary = {
  transactions: number;
  accounts: number;
  categories: number;
  budgets: number;
  recurring: number;
  notifications: number;
  receipts: number;
  merchantMemories: number;
  aiMessages: number;
  sessions: number;
};

export async function deleteUserAccount(
  userId: string,
  password: string,
): Promise<DeletionSummary> {
  const user = await UserModel.findById(userId).select('passwordHash');
  if (!user) throw ApiError.notFound('Account not found');

  const correct = await verifyPassword(password, user.passwordHash);
  if (!correct) {
    // Deliberately the same wording as a failed sign-in. Confirming that a
    // password was wrong is fine; hinting at anything else is not.
    throw ApiError.unauthorized('Password is incorrect');
  }

  const owner = new Types.ObjectId(userId);

  /**
   * Images first, and outside any database work.
   *
   * Cloudinary is a third party that can be slow or down, and a delete that
   * refused to proceed because of it would leave someone unable to close their
   * account. So the images are best-effort and the rows go regardless — the worst
   * case is an orphaned file with nothing pointing at it, which is a cleanup job
   * rather than a privacy hole with a name attached.
   */
  const receipts = await ReceiptModel.find({ userId: owner }).select('publicId').lean();
  for (const receipt of receipts) {
    await destroyUpload(receipt.publicId).catch(() => false);
  }

  /**
   * Then every collection this user appears in.
   *
   * Written as an explicit list rather than a loop over registered models,
   * because a new collection that silently fails to be deleted is a privacy bug
   * that nothing would catch — an explicit list at least shows up in a diff when
   * a module is added. `step6test` asserts the count of collections cleared.
   */
  const [
    transactions,
    accounts,
    categories,
    budgets,
    recurring,
    notifications,
    removedReceipts,
    merchantMemories,
    aiMessages,
    sessions,
  ] = await Promise.all([
    TransactionModel.deleteMany({ userId: owner }),
    AccountModel.deleteMany({ userId: owner }),
    // Only this user's own copies. The shared defaults have `userId: null` and
    // belong to everybody, so a `$or` here would empty the tree for all of them.
    CategoryModel.deleteMany({ userId: owner }),
    BudgetModel.deleteMany({ userId: owner }),
    RecurringModel.deleteMany({ userId: owner }),
    NotificationModel.deleteMany({ userId: owner }),
    ReceiptModel.deleteMany({ userId: owner }),
    MerchantMemoryModel.deleteMany({ userId: owner }),
    AiMessageModel.deleteMany({ userId: owner }),
    RefreshTokenModel.deleteMany({ userId: owner }),
  ]);

  await UserModel.deleteOne({ _id: owner });

  const summary: DeletionSummary = {
    transactions: transactions.deletedCount ?? 0,
    accounts: accounts.deletedCount ?? 0,
    categories: categories.deletedCount ?? 0,
    budgets: budgets.deletedCount ?? 0,
    recurring: recurring.deletedCount ?? 0,
    notifications: notifications.deletedCount ?? 0,
    receipts: removedReceipts.deletedCount ?? 0,
    merchantMemories: merchantMemories.deletedCount ?? 0,
    aiMessages: aiMessages.deletedCount ?? 0,
    sessions: sessions.deletedCount ?? 0,
  };

  // The one place an account deletion is recorded. No email, no name — just that
  // it happened and roughly how much went, which is what an operator needs to
  // answer "did the delete actually run" without retaining the person.
  logger.info({ summary }, 'account deleted');

  return summary;
}
