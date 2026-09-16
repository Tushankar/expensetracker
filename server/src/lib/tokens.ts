import crypto from 'node:crypto';

import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';

import { env } from '../config/env';
import { ApiError } from './ApiError';

export type AccessClaims = {
  sub: string;
  type: 'access';
  /** Token version, bumped on password change to invalidate live access tokens. */
  tv: number;
};

export type RefreshClaims = {
  sub: string;
  type: 'refresh';
  /** Identifies the stored row so a rotated token can be revoked by id. */
  jti: string;
};

const ISSUER = 'paisa-api';

export function signAccessToken(userId: string, tokenVersion: number): string {
  const payload: AccessClaims = { sub: userId, type: 'access', tv: tokenVersion };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: ISSUER,
  } as SignOptions);
}

export function signRefreshToken(userId: string, jti: string): string {
  const payload: RefreshClaims = { sub: userId, type: 'refresh', jti };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
    issuer: ISSUER,
  } as SignOptions);
}

function decode<T>(token: string, secret: string, expected: 'access' | 'refresh'): T {
  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, secret, { issuer: ISSUER });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      // A distinct code, because this is the one 401 the client can fix by itself.
      throw expected === 'access'
        ? ApiError.tokenExpired()
        : ApiError.unauthorized('Session expired, sign in again');
    }
    throw ApiError.unauthorized('Invalid token');
  }

  if (typeof payload === 'string' || payload.type !== expected) {
    // Rejecting a refresh token presented as an access token (and the reverse) is
    // the whole reason `type` is in the claims.
    throw ApiError.unauthorized('Invalid token');
  }

  return payload as T;
}

export function verifyAccessToken(token: string): AccessClaims {
  return decode<AccessClaims>(token, env.JWT_ACCESS_SECRET, 'access');
}

export function verifyRefreshToken(token: string): RefreshClaims {
  return decode<RefreshClaims>(token, env.JWT_REFRESH_SECRET, 'refresh');
}

/**
 * Refresh tokens are stored as a SHA-256 digest, never in the clear. A dump of the
 * sessions collection then yields nothing usable — the same reason passwords are
 * hashed, applied to the credential that outlives them.
 *
 * Plain SHA-256 rather than bcrypt is right here: the input is 200+ bits of
 * server-generated entropy, so there is nothing to brute force, and refresh runs on
 * every cold start where 250ms would be felt.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newTokenId(): string {
  return crypto.randomUUID();
}

/** Milliseconds for a `15m` / `30d` style duration, for computing expiry rows. */
export function durationToMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w|y)?$/.exec(value.trim());
  if (!match?.[1]) throw new Error(`Unparseable duration: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const scale: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    y: 31_536_000_000,
  };
  return amount * (scale[unit] ?? 1000);
}
