import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';

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

/**
 * Loopback, in every form Node reports it.
 *
 * `::ffff:127.0.0.1` is what an IPv4 client looks like on a dual-stack socket,
 * which is the usual shape on Windows and the one that gets missed.
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Blanket ceiling for the whole API. Generous — this is a backstop against abuse,
 * not a quota: a client on Home fires six queries, and a busy session is nowhere
 * near three hundred a minute.
 *
 * Exempt for requests from the machine itself, outside production. The
 * integration suites make a few hundred calls in under a minute and are not
 * abuse; throttling them turns a real protection into a source of flaky tests,
 * which is how rate limits end up being disabled altogether. In production
 * `trust proxy` means `req.ip` is the real client, so nothing is exempt — and the
 * auth limiter, which is the one that actually guards anything, applies
 * everywhere regardless.
 */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  skip: (req) => !env.isProduction && LOOPBACK.has(req.ip ?? ''),
});

/**
 * Tight limit on the two endpoints where a secret can actually be guessed: login
 * and register.
 *
 * Keyed by IP *and* the submitted email, so one attacker cannot lock out a real
 * user by spraying their address, and cannot dodge the limit by rotating
 * addresses from one IP either.
 *
 * Deliberately **not** on `/auth/refresh` or `/auth/logout`. Neither carries an
 * email, so the key would collapse to the bare IP — and every user behind one
 * office, campus or carrier-grade NAT would then share a single twenty-attempts
 * bucket, locking out real people to defend against nothing. A refresh token is
 * 200-plus bits of server-generated entropy under an HMAC; it is not guessable,
 * and a *stolen* one is caught by rotation and reuse detection rather than by a
 * counter. The blanket API limiter still applies to both.
 */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  keyGenerator: (req) => {
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
    // `ipKeyGenerator` collapses an IPv6 address to its /64 prefix. A raw
    // `req.ip` would give one attacker an effectively unlimited supply of keys,
    // since a residential IPv6 allocation contains billions of usable addresses.
    return `${ipKeyGenerator(req.ip ?? 'unknown')}:${email}`;
  },
  skipSuccessfulRequests: true,
});
