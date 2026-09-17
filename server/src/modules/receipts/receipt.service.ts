import { Types } from 'mongoose';

import { ApiError } from '../../lib/ApiError';
import { destroyUpload, thumbnailUrl, verifyUpload, type UploadResult } from '../../lib/cloudinary';
import { zoneOrDefault } from '../../lib/time';
import { TransactionModel } from '../transactions/transaction.model';
import { UserModel } from '../users/user.model';

import { extractFromImage, type ReceiptExtraction } from './receipt.extract';
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
    date: string | null;
    items: { name: string; amount: number | null }[];
    paymentMethod: string | null;
    confidence: 'high' | 'medium' | 'low';
    extractedAt: string | null;
  } | null;
};

/**
 * What the mapper needs, written loosely on purpose.
 *
 * Mongoose infers subdocument fields as `T | null | undefined` regardless of the
 * defaults on the schema, and a hand-written type that insists otherwise only
 * means casting at every call site. The mapper defaults every field anyway, so
 * accepting the loose shape is both honest and less code.
 */
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
    date?: Date | null;
    items?: { name: string; amount?: number | null }[] | null;
    paymentMethod?: string | null;
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
          date: receipt.extraction.date ? receipt.extraction.date.toISOString() : null,
          items: (receipt.extraction.items ?? []).map((item) => ({
            name: item.name,
            amount: item.amount ?? null,
          })),
          paymentMethod: receipt.extraction.paymentMethod ?? null,
          confidence: receipt.extraction.confidence ?? 'low',
          extractedAt: receipt.extraction.extractedAt
            ? receipt.extraction.extractedAt.toISOString()
            : null,
        }
      : null,
  };
}

/**
 * Records an upload the app made directly to Cloudinary.
 *
 * The signature is checked before anything is stored. Without that check this is
 * an endpoint that takes an arbitrary URL from a client and hands it back to every
 * other client to render — the app would happily display whatever someone pointed
 * it at, under the heading "your receipt".
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
  const extraction = await extractFromImage(receipt.url, zoneOrDefault(user?.timezone));

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
