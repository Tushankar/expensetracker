import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { env } from '../../config/env';
import { ErrorCode } from '../../lib/ApiError';
import { createUploadTicket, isStorageConfigured } from '../../lib/cloudinary';
import { ok, created } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';
import { toApiError } from '../ai/groq.client';

import { isVisionConfigured } from './receipt.extract';
import {
  attachReceiptSchema,
  listReceiptsSchema,
  receiptParamsSchema,
  recordUploadSchema,
  type AttachReceiptInput,
  type ListReceiptsQuery,
  type RecordUploadInput,
} from './receipt.schemas';
import {
  attachReceipt,
  deleteReceipt,
  extractReceipt,
  getReceipt,
  listReceipts,
  recordUpload,
} from './receipt.service';

export const receiptRouter: Router = Router();

receiptRouter.use(requireAuth);

/**
 * Per user, because an upload ticket is permission to write to our Cloudinary
 * account and an extraction is a vision call. Both cost money per request, and
 * neither is something one person should be able to do a thousand times a minute.
 */
const receiptLimiter = rateLimit({
  windowMs: env.RECEIPT_RATE_LIMIT_WINDOW_MS,
  limit: env.RECEIPT_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? 'unknown'),
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({
      success: false,
      error: { code: ErrorCode.RATE_LIMITED, message: 'Too many receipts at once. Give it a moment.' },
    });
  },
});

/** Lets the app hide the camera button rather than offer one that cannot work. */
receiptRouter.get('/status', (_req, res) => {
  ok(res, {
    storage: isStorageConfigured(),
    reading: isVisionConfigured(),
    maxBytes: env.RECEIPT_MAX_BYTES,
  });
});

/**
 * Permission to upload one image.
 *
 * The app takes this to Cloudinary directly. Proxying the bytes through here would
 * double the transfer, hold a Node process open for the length of a mobile upload,
 * and make the progress bar on the phone a fiction — it would fill as the phone
 * finished talking to us, not as the image finished arriving.
 */
receiptRouter.post('/signature', receiptLimiter, (req, res) => {
  ok(res, { ticket: createUploadTicket(currentUser(req).id) });
});

receiptRouter.post('/', receiptLimiter, validate({ body: recordUploadSchema }), async (req, res) => {
  const body = req.body as RecordUploadInput;

  const receipt = await recordUpload(
    currentUser(req).id,
    {
      publicId: body.publicId,
      version: body.version,
      signature: body.signature,
      secureUrl: body.secureUrl,
      bytes: body.bytes,
      format: body.format,
      width: body.width,
      height: body.height,
    },
    body.transactionId,
  );

  created(res, { receipt });
});

receiptRouter.get('/', validate({ query: listReceiptsSchema }), async (req, res) => {
  const query = validatedQuery<ListReceiptsQuery>(res);
  ok(res, { receipts: await listReceipts(currentUser(req).id, query) });
});

receiptRouter.get('/:id', validate({ params: receiptParamsSchema }), async (req, res) => {
  ok(res, { receipt: await getReceipt(currentUser(req).id, String(req.params.id)) });
});

/**
 * Reads the image and stores the result on the receipt.
 *
 * Deliberately a separate call from the upload, and deliberately not applied to
 * anything: the app shows what was read and the user confirms it field by field.
 * Writing an extracted total straight onto a transaction would be the one place in
 * this system where a model's number reached a ledger unchecked.
 */
receiptRouter.post(
  '/:id/extract',
  receiptLimiter,
  validate({ params: receiptParamsSchema }),
  async (req, res) => {
    try {
      ok(res, { receipt: await extractReceipt(currentUser(req).id, String(req.params.id)) });
    } catch (error) {
      throw toApiError(error);
    }
  },
);

receiptRouter.post(
  '/:id/attach',
  validate({ params: receiptParamsSchema, body: attachReceiptSchema }),
  async (req, res) => {
    const { transactionId } = req.body as AttachReceiptInput;
    ok(res, {
      receipt: await attachReceipt(currentUser(req).id, String(req.params.id), transactionId),
    });
  },
);

receiptRouter.delete('/:id', validate({ params: receiptParamsSchema }), async (req, res) => {
  await deleteReceipt(currentUser(req).id, String(req.params.id));
  ok(res, { deleted: true });
});
