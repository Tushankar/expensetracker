import crypto from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';

import { logger } from '../config/logger';

/**
 * Stamps every request with an id, echoes it back on the response and puts it in
 * the log line. When a user reports "it failed at 3pm", that id is the only thing
 * that connects their screenshot to a server log.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
}

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as Request).id,
  // 4xx is the client's problem and should not page anyone; 5xx is ours.
  customLogLevel: (_req, res, err) => {
    if (err) return 'error';
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
