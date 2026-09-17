import { z } from 'zod';

import { objectId } from '../accounts/account.schemas';

/**
 * What Cloudinary hands back to the app, as the app reports it.
 *
 * Every field here is client-supplied and therefore suspect — which is exactly why
 * `public_id` and `version` are validated tightly and then re-checked against the
 * signature in `verifyUpload`. Zod proves the shape; the signature proves the
 * content. Neither alone is enough.
 */
export const recordUploadSchema = z.object({
  publicId: z.string().trim().min(1).max(300),
  version: z.coerce.number().int().positive(),
  signature: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{40}$/i, 'Not a Cloudinary signature'),
  secureUrl: z.string().url().max(600),
  bytes: z.coerce.number().int().min(1),
  format: z.string().trim().max(16).default(''),
  width: z.coerce.number().int().min(0).default(0),
  height: z.coerce.number().int().min(0).default(0),
  /** Attaching at upload time saves a round trip on the common path. */
  transactionId: objectId.optional(),
});

export type RecordUploadInput = z.infer<typeof recordUploadSchema>;

/** `null` detaches. Absent would be ambiguous, so the field is required. */
export const attachReceiptSchema = z.object({
  transactionId: objectId.nullable(),
});

export type AttachReceiptInput = z.infer<typeof attachReceiptSchema>;

export const listReceiptsSchema = z.object({
  transactionId: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListReceiptsQuery = z.infer<typeof listReceiptsSchema>;

export const receiptParamsSchema = z.object({ id: objectId });
