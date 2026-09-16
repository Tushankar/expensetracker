import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';

import { ApiError, type FieldIssue } from '../lib/ApiError';

type Schemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

function toIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : '_',
    message: issue.message,
  }));
}

/**
 * Parses and *replaces* the request parts it validates, so handlers receive the
 * coerced, stripped output rather than the raw input. Anything not in the schema
 * is dropped — which is how a client-supplied `userId` or `balance` never reaches
 * a service function in the first place.
 *
 * Express 5 exposes `req.query` as a getter, so the parsed query is stashed on
 * `res.locals` and read back through `validated()`.
 */
export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) res.locals.query = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(ApiError.badRequest('Some fields need fixing', toIssues(error)));
        return;
      }
      next(error);
    }
  };
}

/** The parsed query for a route that declared a `query` schema. */
export function validatedQuery<T>(res: Response): T {
  return res.locals.query as T;
}
