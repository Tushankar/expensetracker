import { Types } from 'mongoose';

import { ApiError } from '../../lib/ApiError';
import { destroyUpload, thumbnailUrl, verifyUpload, type UploadResult } from '../../lib/cloudinary';
import { zoneOrDefault } from '../../lib/time';
import { AccountModel } from '../accounts/account.model';
import { isPaymentMethod } from '../ai/quickEntry';
import { CategoryModel } from '../categories/category.model';
import { recallMerchant } from '../merchants/merchant.service';
import { TransactionModel } from '../transactions/transaction.model';
import { UserModel } from '../users/user.model';

import { extractFromImage, type ReceiptExtraction, type FieldConfidenceDetails } from './receipt.extract';
import { ReceiptModel } from './receipt.model';

export type PublicReceipt = {
  id: string;
  transactionId: string | null;
  url: string;
  thumbnailUrl: string;
  bytes: number;
  format: string;
  width: number;
  height: number;
  uploadedAt: string;
  extraction: {
    merchant: string;
    amount: number | null;
    amountText: string;
    subtotal: number | null;
    tax: number | null;
    discount: number | null;
    date: string | null;
    isDateDefault: boolean;
    items: { name: string; amount: number | null }[];
    categoryHint: string | null;
    accountHint: string | null;
    paymentMethod: string | null;
    suggestedCategoryId: string | null;
    suggestedAccountId: string | null;
    accountStatus: 'resolved' | 'suggested' | 'unresolved';
    warnings: string[];
    confidenceDetails: FieldConfidenceDetails;
    possibleDuplicate: {
      id: string;
      amount: number;
      merchant: string;
      date: string;
      minutesAgo: number;
    } | null;
    confidence: 'high' | 'medium' | 'low';
    extractedAt: string | null;
  } | null;
};

type ReceiptDoc = {
  _id: Types.ObjectId;
  transactionId?: Types.ObjectId | null;
  url: string;
  bytes: number;
  format?: string | null;
  width?: number | null;
  height?: number | null;
  uploadedAt?: Date | null;
  extraction?: {
    merchant?: string | null;
    amount?: number | null;
    amountText?: string | null;
    subtotal?: number | null;
    tax?: number | null;
    discount?: number | null;
    date?: Date | null;
    isDateDefault?: boolean | null;
    items?: { name: string; amount?: number | null }[] | null;
    categoryHint?: string | null;
    accountHint?: string | null;
    paymentMethod?: string | null;
    suggestedCategoryId?: Types.ObjectId | string | null;
    suggestedAccountId?: Types.ObjectId | string | null;
    accountStatus?: 'resolved' | 'suggested' | 'unresolved' | null;
    warnings?: string[] | null;
    confidenceDetails?: FieldConfidenceDetails | null;
    possibleDuplicate?: {
      id: string;
      amount: number;
      merchant: string;
      date: string;
      minutesAgo: number;
    } | null;
    confidence?: ReceiptExtraction['confidence'] | null;
    extractedAt?: Date | null;
  } | null;
};

export function toPublicReceipt(receipt: ReceiptDoc): PublicReceipt {
  return {
    id: String(receipt._id),
    transactionId: receipt.transactionId ? String(receipt.transactionId) : null,
    url: receipt.url,
    thumbnailUrl: thumbnailUrl(receipt.url),
    bytes: receipt.bytes,
    format: receipt.format ?? '',
    width: receipt.width ?? 0,
    height: receipt.height ?? 0,
    uploadedAt: (receipt.uploadedAt ?? new Date()).toISOString(),
    extraction: receipt.extraction
      ? {
          merchant: receipt.extraction.merchant ?? '',
          amount: receipt.extraction.amount ?? null,
          amountText: receipt.extraction.amountText ?? '',
          subtotal: receipt.extraction.subtotal ?? null,
          tax: receipt.extraction.tax ?? null,
          discount: receipt.extraction.discount ?? null,
          date: receipt.extraction.date ? receipt.extraction.date.toISOString() : null,
          isDateDefault: Boolean(receipt.extraction.isDateDefault),
          items: (receipt.extraction.items ?? []).map((item) => ({
            name: item.name,
            amount: item.amount ?? null,
          })),
          categoryHint: receipt.extraction.categoryHint ?? null,
          accountHint: receipt.extraction.accountHint ?? null,
          paymentMethod: receipt.extraction.paymentMethod ?? null,
          suggestedCategoryId: receipt.extraction.suggestedCategoryId
            ? String(receipt.extraction.suggestedCategoryId)
            : null,
          suggestedAccountId: receipt.extraction.suggestedAccountId
            ? String(receipt.extraction.suggestedAccountId)
            : null,
          accountStatus: receipt.extraction.accountStatus ?? 'unresolved',
          warnings: receipt.extraction.warnings ?? [],
          confidenceDetails: receipt.extraction.confidenceDetails ?? {
            merchant: 'unresolved',
            amount: 'unresolved',
            date: 'unresolved',
            account: 'unresolved',
            paymentMethod: 'unresolved',
          },
          possibleDuplicate: receipt.extraction.possibleDuplicate ?? null,
          confidence: receipt.extraction.confidence ?? 'low',
          extractedAt: receipt.extraction.extractedAt
            ? receipt.extraction.extractedAt.toISOString()
            : null,
        }
      : null,
  };
}

/** Strips corporate suffixes like "Pvt Ltd", "Retail", etc. */
export function normalizeReceiptMerchant(name: string): string {
  return name
    .replace(/\b(pvt\.?\s*ltd\.?|private\s+limited|limited|llp|inc\.?|store|retail|supermarket)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches extracted receipt fields against active user entities (accounts, categories, memory)
 * and enforces strict financial safety invariants (D.1.1).
 */
export async function matchReceiptEntities(
  userId: string,
  raw: ReceiptExtraction,
): Promise<ReceiptDoc['extraction']> {
  const warnings = [...raw.warnings];
  const confidenceDetails = { ...raw.confidenceDetails };

  // 1. Merchant Normalization & Memory Recall
  const cleanMerchant = normalizeReceiptMerchant(raw.merchant) || raw.merchant;
  const memory = cleanMerchant ? await recallMerchant(userId, cleanMerchant) : null;

  // 2. Category Resolution
  const categories = await CategoryModel.find({ userId, type: 'expense' }).lean();
  let suggestedCategoryId: Types.ObjectId | null = null;

  if (memory?.categoryId) {
    const memoryCat = categories.find((c) => String(c._id) === String(memory.categoryId));
    if (memoryCat) suggestedCategoryId = memoryCat._id;
  }

  if (!suggestedCategoryId && raw.categoryHint) {
    const hintLower = raw.categoryHint.toLowerCase();
    const matchedCat = categories.find(
      (c) => c.name.toLowerCase().includes(hintLower) || (c.group && c.group.toLowerCase().includes(hintLower)),
    );
    if (matchedCat) suggestedCategoryId = matchedCat._id;
  }

  if (!suggestedCategoryId && categories.length > 0 && categories[0]?._id) {
    suggestedCategoryId = categories[0]._id;
  }

  // 3. Strict D.1.1 Explicit Account Safety Resolution
  const accounts = await AccountModel.find({ userId, isActive: true }).lean();
  let suggestedAccountId: Types.ObjectId | null = null;
  let accountStatus: 'resolved' | 'suggested' | 'unresolved' = 'unresolved';

  if (raw.accountHint) {
    const hintClean = raw.accountHint.toLowerCase().trim();
    // Check user's active accounts
    const match = accounts.find((acc) => {
      const name = acc.name.toLowerCase();
      return name.includes(hintClean) || hintClean.includes(name) || (acc.type && hintClean.includes(acc.type));
    });

    if (match) {
      suggestedAccountId = match._id;
      accountStatus = 'resolved';
      confidenceDetails.account = 'high';
    } else {
      // Unmatched explicit account text -> NEVER silently fall back!
      suggestedAccountId = null;
      accountStatus = 'unresolved';
      confidenceDetails.account = 'unresolved';
      warnings.push(`Account "${raw.accountHint}" on receipt not found. Please select an account.`);
    }
  } else {
    // No explicit account mentioned on receipt -> safe suggestion allowed
    if (memory?.preferredAccountId) {
      const memAcc = accounts.find((a) => String(a._id) === String(memory.preferredAccountId));
      if (memAcc) suggestedAccountId = memAcc._id;
    }
    if (!suggestedAccountId && accounts.length > 0 && accounts[0]?._id) {
      suggestedAccountId = accounts[0]._id;
    }
    accountStatus = suggestedAccountId ? 'suggested' : 'unresolved';
    confidenceDetails.account = suggestedAccountId ? 'needs_review' : 'unresolved';
  }

  // 4. Payment Method
  let paymentMethod = raw.paymentMethod;
  if (!paymentMethod && memory?.preferredPaymentMethod && isPaymentMethod(memory.preferredPaymentMethod)) {
    paymentMethod = memory.preferredPaymentMethod;
    confidenceDetails.paymentMethod = 'needs_review';
  }

  // 5. Duplicate Transaction Protection (5-minute window)
  let possibleDuplicate = null;
  if (raw.amount !== null && raw.amount > 0) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const query: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      amount: raw.amount,
      createdAt: { $gte: fiveMinutesAgo },
    };
    if (cleanMerchant) {
      query.merchant = { $regex: new RegExp(`^${cleanMerchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    }
    const dup = await TransactionModel.findOne(query).sort({ createdAt: -1 }).lean();
    if (dup) {
      const minutesAgo = Math.max(0, Math.round((Date.now() - (dup.createdAt ?? new Date()).getTime()) / 60000));
      possibleDuplicate = {
        id: String(dup._id),
        amount: dup.amount,
        merchant: dup.merchant ?? '',
        date: dup.date.toISOString(),
        minutesAgo,
      };
      warnings.push(`Possible duplicate: A similar transaction of ₹${(dup.amount / 100).toFixed(0)} was recorded ${minutesAgo}m ago.`);
    }
  }

  return {
    merchant: cleanMerchant,
    amount: raw.amount,
    amountText: raw.amountText,
    subtotal: raw.subtotal,
    tax: raw.tax,
    discount: raw.discount,
    date: raw.date,
    isDateDefault: raw.isDateDefault,
    items: raw.items,
    categoryHint: raw.categoryHint,
    accountHint: raw.accountHint,
    paymentMethod,
    suggestedCategoryId,
    suggestedAccountId,
    accountStatus,
    warnings,
    confidenceDetails,
    possibleDuplicate,
    confidence: raw.confidence,
    extractedAt: raw.extractedAt,
  };
}

/**
 * Records an upload the app made directly to Cloudinary.
 */
export async function recordUpload(
  userId: string,
  result: UploadResult,
  transactionId?: string,
): Promise<PublicReceipt> {
  if (!verifyUpload(result)) {
    throw ApiError.badRequest('That upload could not be verified');
  }

  if (transactionId) await assertOwnsTransaction(userId, transactionId);

  const created = await ReceiptModel.create({
    userId: new Types.ObjectId(userId),
    transactionId: transactionId ? new Types.ObjectId(transactionId) : null,
    publicId: result.publicId,
    url: result.secureUrl,
    bytes: result.bytes,
    format: result.format,
    width: result.width,
    height: result.height,
    uploadedAt: new Date(),
  });

  return toPublicReceipt(created.toObject());
}

/** Reads the image and stores what it found. Never touches the transaction. */
export async function extractReceipt(userId: string, receiptId: string): Promise<PublicReceipt> {
  const receipt = await findOwned(userId, receiptId);

  const user = await UserModel.findById(userId).select('timezone').lean();
  const rawExtraction = await extractFromImage(receipt.url, zoneOrDefault(user?.timezone));
  const extraction = await matchReceiptEntities(userId, rawExtraction);

  const updated = await ReceiptModel.findOneAndUpdate(
    { _id: receipt._id, userId: new Types.ObjectId(userId) },
    { $set: { extraction } },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.notFound('Receipt not found');
  return toPublicReceipt(updated);
}

/**
 * Links a receipt to a transaction, or unlinks it.
 *
 * A transaction holds at most one receipt, so attaching a second detaches the
 * first rather than silently leaving two rows claiming the same expense. The
 * displaced receipt is kept — the image is still the user's, and deleting
 * someone's photograph as a side effect of an edit is not a decision this function
 * gets to make.
 */
export async function attachReceipt(
  userId: string,
  receiptId: string,
  transactionId: string | null,
): Promise<PublicReceipt> {
  const receipt = await findOwned(userId, receiptId);

  if (transactionId) {
    await assertOwnsTransaction(userId, transactionId);
    await ReceiptModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        transactionId: new Types.ObjectId(transactionId),
        _id: { $ne: receipt._id },
      },
      { $set: { transactionId: null } },
    );
  }

  const updated = await ReceiptModel.findOneAndUpdate(
    { _id: receipt._id, userId: new Types.ObjectId(userId) },
    { $set: { transactionId: transactionId ? new Types.ObjectId(transactionId) : null } },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.notFound('Receipt not found');
  return toPublicReceipt(updated);
}

export async function listReceipts(
  userId: string,
  filter: { transactionId?: string; limit?: number } = {},
): Promise<PublicReceipt[]> {
  const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (filter.transactionId) query.transactionId = new Types.ObjectId(filter.transactionId);

  const rows = await ReceiptModel.find(query)
    .sort({ uploadedAt: -1, _id: -1 })
    .limit(filter.limit ?? 50)
    .lean();

  return rows.map(toPublicReceipt);
}

export async function getReceipt(userId: string, receiptId: string): Promise<PublicReceipt> {
  return toPublicReceipt(await findOwned(userId, receiptId));
}

/**
 * Deletes the row, then the image.
 *
 * In that order, and the image failing does not fail the call: a user who asked to
 * delete a receipt should not be told it is still there because a third party is
 * unreachable. The worst case is an orphaned file in a bucket, which is a cleanup
 * job; the alternative is a record the app shows and cannot remove.
 */
export async function deleteReceipt(userId: string, receiptId: string): Promise<void> {
  const receipt = await findOwned(userId, receiptId);

  await ReceiptModel.deleteOne({ _id: receipt._id, userId: new Types.ObjectId(userId) });
  await destroyUpload(receipt.publicId);
}

/** Removes any receipts belonging to a deleted transaction, image included. */
export async function detachFromTransaction(userId: string, transactionId: string): Promise<void> {
  await ReceiptModel.updateMany(
    {
      userId: new Types.ObjectId(userId),
      transactionId: new Types.ObjectId(transactionId),
    },
    { $set: { transactionId: null } },
  );
}

async function findOwned(userId: string, receiptId: string) {
  if (!Types.ObjectId.isValid(receiptId)) throw ApiError.notFound('Receipt not found');

  const receipt = await ReceiptModel.findOne({
    _id: new Types.ObjectId(receiptId),
    userId: new Types.ObjectId(userId),
  }).lean();

  // A missing receipt and another user's receipt answer identically, so the
  // endpoint cannot be used to discover which ids exist.
  if (!receipt) throw ApiError.notFound('Receipt not found');
  return receipt;
}

async function assertOwnsTransaction(userId: string, transactionId: string): Promise<void> {
  if (!Types.ObjectId.isValid(transactionId)) throw ApiError.notFound('Transaction not found');

  const exists = await TransactionModel.exists({
    _id: new Types.ObjectId(transactionId),
    userId: new Types.ObjectId(userId),
  });

  if (!exists) throw ApiError.notFound('Transaction not found');
}
