import type { Response } from 'express';

/**
 * One response shape for the whole API.
 *
 *   { "success": true,  "data": …, "meta"?: … }
 *   { "success": false, "error": { "code", "message", "issues"? } }
 *
 * A client can branch on `success` before it knows anything else about the
 * endpoint, which is what makes a generic fetch wrapper possible.
 */
export type ApiSuccess<T> = { success: true; data: T; meta?: Record<string, unknown> };

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    issues?: { field: string; message: string }[];
    meta?: Record<string, unknown>;
  };
};

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>): Response {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.status(200).json(body);
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json({ success: true, data } satisfies ApiSuccess<T>);
}

/** 200 with an empty object rather than 204 — clients get a parseable body either way. */
export function noContent(res: Response): Response {
  return res.status(200).json({ success: true, data: { deleted: true } });
}
