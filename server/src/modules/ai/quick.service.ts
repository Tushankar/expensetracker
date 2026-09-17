import { Types } from 'mongoose';
import { z } from 'zod';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { zoneOrDefault } from '../../lib/time';
import { AccountModel } from '../accounts/account.model';
import { CategoryModel } from '../categories/category.model';
import { TransactionModel, type PaymentMethod } from '../transactions/transaction.model';
import { UserModel } from '../users/user.model';

import { suggestCategory, type SuggestionSource } from './ai.service';
import { complete, isAiConfigured } from './groq.client';
import { parseQuickEntry } from './quickEntry';

/**
 * Zod validation schema for Groq structured fallback output.
 */
export const GroqParseResponseSchema = z.object({
  amount: z.number().nullable().optional(),
  merchant: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  reason: z.string().optional(),
});

export type QuickEntryProposal = {
  /** The detected transaction type. Usually 'expense', but 'income' when salary/earned phrasing is found. */
  type: 'expense' | 'income';
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
  /** Person obligation details if detected deterministically */
  obligation?: {
    personName: string;
    direction: 'owed_to_me' | 'i_owe';
    type: 'loan' | 'paid_for' | 'borrowed';
  } | null;
  /** A recent transaction that looks like a duplicate of this one. */
  possibleDuplicate?: {
    id: string;
    amount: number;
    merchant: string;
    date: string;
    minutesAgo: number;
  } | null;
};

/**
 * The account a new expense should land on.
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
      isActive: true,
    })
      .select('name')
      .lean();
    if (account) return { id: String(account._id), name: account.name };
  }

  const first = await AccountModel.findOne({
    userId: new Types.ObjectId(userId),
    isActive: true,
  })
    .sort({ createdAt: 1 })
    .select('name')
    .lean();

  return first ? { id: String(first._id), name: first.name } : null;
}

/**
 * Fuzzy-matches a parsed account hint against the user's actual accounts.
 *
 * A case-insensitive substring match on the account name. \"hdfc\" matches
 * \"HDFC Bank\" and \"HDFC Savings\". Returns the first active match.
 */
async function resolveAccountHint(
  userId: string,
  hint: string,
): Promise<{ id: string; name: string } | null> {
  if (!hint) return null;

  const accounts = await AccountModel.find({
    userId: new Types.ObjectId(userId),
    isActive: true,
  })
    .select('name')
    .lean();

  const lower = hint.toLowerCase();
  const match = accounts.find((a) => a.name.toLowerCase().includes(lower));
  return match ? { id: String(match._id), name: match.name } : null;
}

/**
 * Checks for a recent transaction that looks identical to what was just parsed.
 *
 * \"Identical\" means same user, same amount, same merchant (case-insensitive),
 * and created within the last 5 minutes. This catches the double-tap but does
 * not block a second coffee at the same price an hour later.
 */
async function checkDuplicate(
  userId: string,
  amount: number,
  merchant: string,
  _date: Date,
): Promise<QuickEntryProposal['possibleDuplicate']> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const match = await TransactionModel.findOne({
    userId: new Types.ObjectId(userId),
    amount,
    ...(merchant.trim()
      ? { merchant: { $regex: `^${merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }
      : { $or: [{ merchant: null }, { merchant: '' }] }),
    createdAt: { $gte: fiveMinutesAgo },
  })
    .sort({ createdAt: -1 })
    .select('amount merchant date createdAt')
    .lean();

  if (!match) return null;

  const minutesAgo = Math.round((Date.now() - new Date(match.createdAt ?? Date.now()).getTime()) / 60_000);

  return {
    id: String(match._id),
    amount: match.amount,
    merchant: match.merchant ?? '',
    date: match.date.toISOString(),
    minutesAgo,
  };
}

/**
 * Structured Groq fallback when deterministic rules cannot resolve an ambiguous phrasing.
 */
async function groqParseFallback(
  text: string,
  categories: { _id: unknown; name: string; group: string }[],
): Promise<{
  amountRupees: number | null;
  merchant: string | null;
  categoryId: string | null;
  categoryName: string | null;
  confidenceNum: number;
  reason: string;
} | null> {
  if (!isAiConfigured()) return null;

  try {
    const raw = await complete({
      model: env.GROQ_FAST_MODEL,
      temperature: 0,
      maxTokens: 300,
      json: true,
      reasoning: 'low',
      messages: [
        {
          role: 'system',
          content: `You parse quick expense text for an Indian expense tracker.
Reply with JSON ONLY adhering to this schema:
{
  "amount": <number in rupees or null>,
  "merchant": <clean merchant name or null>,
  "category": <exact category name from the list below, or null if uncertain>,
  "confidence": <float between 0.0 and 1.0>,
  "reason": <short explanation string or null>
}

Do NOT invent categories. The category MUST match one of the available category names listed below, or be null.

Available categories:
${categories.map((c) => c.name).join(', ')}`,
        },
        { role: 'user', content: text.slice(0, 160) },
      ],
    });

    const parsed = JSON.parse(raw);
    const validated = GroqParseResponseSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn({ err: validated.error }, 'Groq quick parse response failed zod validation');
      return null;
    }

    const { amount, merchant, category, confidence, reason } = validated.data;
    const match = category
      ? categories.find((c) => c.name.toLowerCase() === category.trim().toLowerCase())
      : null;

    return {
      amountRupees: typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : null,
      merchant: merchant && merchant.trim().length > 1 ? merchant.trim() : null,
      categoryId: match ? String(match._id) : null,
      categoryName: match ? match.name : null,
      confidenceNum: confidence,
      reason: reason || 'AI inferred from text',
    };
  } catch (error) {
    logger.warn({ err: error }, 'Groq quick parse fallback failed');
    return null;
  }
}

export async function proposeFromText(
  userId: string,
  text: string,
  type: 'expense' | 'income' = 'expense',
): Promise<QuickEntryProposal> {
  const user = await UserModel.findById(userId).select('timezone').lean();
  const zone = zoneOrDefault(user?.timezone);

  // 1. Deterministic extraction: amount, date, method, merchant, categoryHint, accountHint, incomeIntent
  const parsed = parseQuickEntry(text, zone);

  // Income intent detection — override the requested type when the phrasing is clear
  const resolvedType: 'expense' | 'income' =
    parsed.incomeIntent ? 'income' : type;

  // Fetch active categories and default account in parallel
  const [categories, fallbackAccount] = await Promise.all([
    CategoryModel.find({
      $or: [{ userId: null }, { userId: new Types.ObjectId(userId) }],
      isActive: true,
      type: resolvedType,
    })
      .select('name group')
      .sort({ sortOrder: 1 })
      .lean(),
    defaultAccount(userId),
  ]);

  // 1b. Resolve account from parsed hint (if any)
  const hintAccount = parsed.accountHint
    ? await resolveAccountHint(userId, parsed.accountHint)
    : null;

  let finalAmount = parsed.amount?.paise ?? null;
  let finalMerchant = parsed.merchant;
  let finalCategoryId: string | null = null;
  let finalCategoryName: string | null = null;
  let finalSource: SuggestionSource = 'none';
  let finalReason = '';
  let confidence: QuickEntryProposal['confidence'] = 'low';
  let preferredAccountId: string | null = null;
  let preferredPaymentMethod: string | null = null;

  // 2. Deterministic category match from Indian Knowledge Base
  if (parsed.categoryHint) {
    let directMatch = categories.find(
      (c) => c.name.toLowerCase() === parsed.categoryHint?.toLowerCase(),
    );

    // 2b. Check aliases if exact category name is not in user's category list
    if (!directMatch && parsed.categoryAliases) {
      for (const alias of parsed.categoryAliases) {
        directMatch = categories.find((c) => c.name.toLowerCase() === alias.toLowerCase());
        if (directMatch) break;
      }
    }

    // 2c. Fallback to category group
    if (!directMatch && parsed.categoryGroup) {
      directMatch = categories.find(
        (c) => c.group.toLowerCase() === parsed.categoryGroup?.toLowerCase(),
      );
    }

    if (directMatch) {
      finalCategoryId = String(directMatch._id);
      finalCategoryName = directMatch.name;
      finalSource = 'merchant';
      finalReason = parsed.merchant
        ? `${parsed.merchant} is a known merchant`
        : `Identified category ${directMatch.name}`;
      confidence = 'high';
    }
  }

  // 3. Check user's past merchant memory if merchant is present and not yet resolved
  if (!finalCategoryId && parsed.merchant.trim()) {
    const suggestion = await suggestCategory(userId, {
      merchant: parsed.merchant,
      amount: parsed.amount?.paise,
      type: resolvedType,
    });

    if (suggestion?.categoryId) {
      finalCategoryId = suggestion.categoryId;
      finalCategoryName = suggestion.categoryName;
      finalSource = suggestion.source;
      finalReason = suggestion.reason;
      // A model's opinion is never high (spec §1)
      confidence =
        suggestion.source !== 'model' && suggestion.confidence === 'high' && !parsed.amount?.ambiguous
          ? 'high'
          : 'medium';
    }
  }

  // 3b. Check merchant memory for account/payment preferences
  if (parsed.merchant.trim()) {
    try {
      const { recallMerchant } = await import('../merchants/merchant.service');
      const memory = await recallMerchant(userId, parsed.merchant);
      if (memory) {
        if (memory.preferredAccountId) {
          preferredAccountId = memory.preferredAccountId;
        }
        if (memory.preferredPaymentMethod) {
          preferredPaymentMethod = memory.preferredPaymentMethod;
        }
      }
    } catch {
      // Merchant memory is a nicety, not a requirement
    }
  }

  // 4. Ambiguous input: Invoke Groq fallback with strict Zod validation
  if (!finalCategoryId) {
    const groqResult = await groqParseFallback(text, categories);

    if (groqResult) {
      if (finalAmount === null && groqResult.amountRupees) {
        finalAmount = Math.round(groqResult.amountRupees * 100);
      }
      if (!finalMerchant && groqResult.merchant) {
        finalMerchant = groqResult.merchant;
      }

      // Respect confidence threshold: low confidence (< 0.60) means DO NOT invent a category
      if (groqResult.categoryId && groqResult.confidenceNum >= 0.60) {
        finalCategoryId = groqResult.categoryId;
        finalCategoryName = groqResult.categoryName;
        finalSource = 'model';
        // A model's opinion is never high (spec §1)
        confidence = 'medium';
      }
    }
  }

  // 5. Resolve account:
  // FINANCIAL SAFETY INVARIANT (Phase D.1.1):
  // When an explicit account was specified by the user (e.g. "from ICICI", "HDFC Zomato", "using SBI"):
  // - If it matches an active account owned by this user -> use it.
  // - If it does NOT match -> DO NOT silently fall back to default or merchant memory!
  //   Leave account unresolved (null) and require confirmation.
  // When NO explicit account was specified:
  // - Suggest merchant preference (if active) > default/recent account.
  let resolvedAccount: { id: string; name: string } | null = null;
  let explicitAccountNotFound = false;

  if (parsed.accountHint) {
    if (hintAccount) {
      resolvedAccount = hintAccount;
    } else {
      explicitAccountNotFound = true;
      resolvedAccount = null;
    }
  } else {
    resolvedAccount =
      (preferredAccountId
        ? await AccountModel.findOne({
            _id: new Types.ObjectId(preferredAccountId),
            userId: new Types.ObjectId(userId),
            isActive: true,
          })
            .select('name')
            .lean()
            .then((a) => (a ? { id: String(a._id), name: a.name } : null))
        : null) ?? fallbackAccount;
  }

  // 6. Resolve payment method: explicit > merchant preference > default
  // FINANCIAL SAFETY INVARIANT: Explicit method never overridden by learned/inferred preference.
  const resolvedMethod: PaymentMethod =
    parsed.method?.method ??
    ((preferredPaymentMethod ?? null) as PaymentMethod | null) ??
    'upi';

  // 7. Duplicate check
  let possibleDuplicate: QuickEntryProposal['possibleDuplicate'] = null;
  if (finalAmount && finalAmount > 0) {
    possibleDuplicate = await checkDuplicate(
      userId,
      finalAmount,
      finalMerchant,
      parsed.date.date,
    );
  }

  const warnings: string[] = [];
  if (!finalAmount) warnings.push('No amount found');
  if (parsed.amount?.ambiguous) warnings.push('More than one number — check the amount');
  if (!finalCategoryId) warnings.push('Pick a category');
  if (explicitAccountNotFound) {
    warnings.push(`Account "${parsed.accountHint}" not found. Please select an account.`);
  } else if (!resolvedAccount) {
    warnings.push('Please select an account');
  }
  if (possibleDuplicate) {
    warnings.push(`Similar transaction added ${possibleDuplicate.minutesAgo} min ago`);
  }

  // Adjust overall confidence
  if (!finalAmount || !finalCategoryId || !resolvedAccount) {
    confidence = 'low';
  } else if (parsed.amount?.ambiguous && confidence === 'high') {
    confidence = 'medium';
  }

  return {
    type: resolvedType,
    amount: finalAmount,
    merchant: finalMerchant,
    categoryId: finalCategoryId,
    categoryName: finalCategoryName,
    categorySource: finalSource,
    categoryReason: finalReason,
    accountId: resolvedAccount?.id ?? null,
    accountName: resolvedAccount?.name ?? null,
    paymentMethod: resolvedMethod,
    date: parsed.date.date.toISOString(),
    confidence,
    warnings,
    matched: {
      amount: parsed.amount?.text ?? null,
      date: parsed.date.text,
      method: parsed.method?.text ?? null,
    },
    obligation: parsed.obligation ?? null,
    possibleDuplicate,
  };
}

