import rateLimit, { type Options } from 'express-rate-limit';

import { env } from '../config/env';
import { ErrorCode } from '../lib/ApiError';

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Must match the API's envelope — a client that only knows how to parse
  // `{ success, error }` should not get a different shape when it is throttled.
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many requests. Wait a moment and try again.',
      },
    });
  },
};

/** Blanket ceiling for the whole API. Generous — this is a backstop, not a quota. */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
});

/**
 * Tight limit on the endpoints worth attacking: login, register, refresh.
 *
 * Keyed by IP *and* the submitted email, so one attacker cannot lock out a real
 * user by spraying their address, and cannot dodge the limit by rotating
 * addresses from one IP either.
 */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  keyGenerator: (req) => {
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
    return `${req.ip ?? 'unknown'}:${email}`;
  },
  skipSuccessfulRequests: true,
});
