import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError, ErrorCode, type FieldIssue } from '../lib/ApiError';
import type { ApiFailure } from '../lib/response';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No route for ${req.method} ${req.path}`));
}

type Normalised = {
  status: number;
  code: string;
  message: string;
  issues?: FieldIssue[];
  meta?: Record<string, unknown>;
};

/**
 * Turns anything thrown anywhere in the stack into the API's failure envelope.
 *
 * The rule is that a caller learns what they can fix and nothing else: an
 * `ApiError` carries a message written for a user, and everything else collapses
 * to a generic 500. A driver error string that names a collection, or a Mongo
 * duplicate-key error that quotes the conflicting value, is an information leak
 * dressed up as helpfulness.
 */
function normalise(error: unknown): Normalised {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      issues: error.issues,
      meta: error.meta,
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      status: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Some fields need fixing',
      issues: Object.entries(error.errors).map(([field, detail]) => ({
        field,
        message: detail.message,
      })),
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      status: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'That id is not valid',
      issues: [{ field: error.path, message: 'Expected a valid id' }],
    };
  }

  // Duplicate key. The index name says which uniqueness rule was broken without
  // echoing the value back.
  if (typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000) {
    return {
      status: 409,
      code: ErrorCode.CONFLICT,
      message: 'That already exists',
    };
  }

  if (
    error instanceof SyntaxError &&
    'body' in error &&
    (error as unknown as { status?: number }).status === 400
  ) {
    return { status: 400, code: ErrorCode.VALIDATION_ERROR, message: 'Request body is not valid JSON' };
  }

  if ((error as { type?: string })?.type === 'entity.too.large') {
    return { status: 413, code: ErrorCode.PAYLOAD_TOO_LARGE, message: 'Request body is too large' };
  }

  return { status: 500, code: ErrorCode.INTERNAL, message: 'Something went wrong' };
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Express's own contract: once headers are out the only correct move is to let
  // the default handler tear the connection down.
  if (res.headersSent) {
    next(error);
    return;
  }

  const normalised = normalise(error);

  if (normalised.status >= 500) {
    logger.error({ err: error, reqId: req.id, url: req.originalUrl }, 'unhandled error');
  } else {
    logger.debug({ reqId: req.id, code: normalised.code, url: req.originalUrl }, 'request failed');
  }

  const body: ApiFailure = {
    success: false,
    error: {
      code: normalised.code,
      message: normalised.message,
      ...(normalised.issues ? { issues: normalised.issues } : {}),
      ...(normalised.meta ? { meta: normalised.meta } : {}),
    },
  };

  // Outside production the stack is worth far more than the secrecy.
  if (!env.isProduction && normalised.status >= 500 && error instanceof Error) {
    body.error.meta = { ...body.error.meta, stack: error.stack };
  }

  res.status(normalised.status).json(body);
}
