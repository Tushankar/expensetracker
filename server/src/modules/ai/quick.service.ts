import { Types } from 'mongoose';

import { zoneOrDefault } from '../../lib/time';
import { AccountModel } from '../accounts/account.model';
import { TransactionModel, type PaymentMethod } from '../transactions/transaction.model';
import { UserModel } from '../users/user.model';

import { suggestCategory, type SuggestionSource } from './ai.service';
import { parseQuickEntry } from './quickEntry';

/**
 * "Petrol 1200" to something a person can check in one glance.
 *
 * The contract with the app is that this never writes. It returns a proposal with
 * its own confidence attached, the app shows it, and the user taps Save or Edit.
 * That confirmation step is not politeness — it is the only thing standing between
 * a parser that is right nine times in ten and a ledger that is wrong one time in
 * ten, forever, silently.
 */

export type QuickEntryProposal = {
  /** Null when no amount could be read. The app must not offer to save it. */
  amount: number | null;
  merchant: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySource: SuggestionSource;
  categoryReason: string;
  accountId: string | null;
  accountName: string | null;
  paymentMethod: PaymentMethod;
  date: string;
  /**
   * `high` only when the amount was unambiguous *and* the category came from this
   * user's own history or the brand table. A model's opinion is never high.
   */
  confidence: 'high' | 'medium' | 'low';
  /** What the app tells the user it was unsure about. Empty when it is confident. */
  warnings: string[];
  /** The fragments each field was read from, so the preview can show its working. */
  matched: { amount: string | null; date: string | null; method: string | null };
};

/**
 * The account a new expense should land on.
 *
 * Whatever they used last, because that is right far more often than "the first
 * one alphabetically" and costs one indexed read. Falls back to the oldest active
 * account, which for a new user is the one registration created.
 */
async function defaultAccount(
  userId: string,
): Promise<{ id: string; name: string } | null> {
  const recent = await TransactionModel.findOne({
    userId: new Types.ObjectId(userId),
    type: 'expense',
  })
    .sort({ date: -1, _id: -1 })
    .select('accountId')
    .lean();

  if (recent?.accountId) {
    const account = await AccountModel.findOne({
      _id: recent.accountId,
      userId: new Types.ObjectId(userId),
      isArchived: false,
    })
      .select('name')
      .lean();
    if (account) return { id: String(account._id), name: account.name };
  }

  const first = await AccountModel.findOne({
    userId: new Types.ObjectId(userId),
    isArchived: false,
  })
    .sort({ createdAt: 1 })
    .select('name')
    .lean();

  return first ? { id: String(first._id), name: first.name } : null;
}

export async function proposeFromText(
  userId: string,
  text: string,
  type: 'expense' | 'income' = 'expense',
): Promise<QuickEntryProposal> {
  const user = await UserModel.findById(userId).select('timezone').lean();
  const zone = zoneOrDefault(user?.timezone);

  const parsed = parseQuickEntry(text, zone);

  const [suggestion, account] = await Promise.all([
    parsed.merchant
      ? suggestCategory(userId, {
          merchant: parsed.merchant,
          amount: parsed.amount?.paise,
          type,
        })
      : Promise.resolve(null),
    defaultAccount(userId),
  ]);

  const warnings: string[] = [];
  if (!parsed.amount) warnings.push('No amount found');
  if (parsed.amount?.ambiguous) warnings.push('More than one number — check the amount');
  if (!parsed.merchant) warnings.push('No merchant read from that');
  if (!suggestion?.categoryId) warnings.push('Pick a category');

  const confidence: QuickEntryProposal['confidence'] =
    !parsed.amount || !suggestion?.categoryId
      ? 'low'
      : parsed.amount.ambiguous
        ? 'medium'
        : suggestion.source === 'memory' || suggestion.source === 'merchant'
          ? 'high'
          : 'medium';

  return {
    amount: parsed.amount?.paise ?? null,
    merchant: parsed.merchant,
    categoryId: suggestion?.categoryId ?? null,
    categoryName: suggestion?.categoryName ?? null,
    categorySource: suggestion?.source ?? 'none',
    categoryReason: suggestion?.reason ?? '',
    accountId: account?.id ?? null,
    accountName: account?.name ?? null,
    // Nothing in the text beats what they normally do, and the app overrides this
    // with its own remembered choice anyway when the text said nothing.
    paymentMethod: parsed.method?.method ?? 'upi',
    date: parsed.date.date.toISOString(),
    confidence,
    warnings,
    matched: {
      amount: parsed.amount?.text ?? null,
      date: parsed.date.text,
      method: parsed.method?.text ?? null,
    },
  };
}
