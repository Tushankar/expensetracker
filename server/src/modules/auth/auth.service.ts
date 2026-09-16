import { Types } from 'mongoose';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ApiError } from '../../lib/ApiError';
import { fakeVerify, hashPassword, verifyPassword } from '../../lib/password';
import { withTransaction } from '../../lib/session';
import {
  durationToMs,
  hashToken,
  newTokenId,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/tokens';
import { seedUserDefaults } from '../../seed/seedUser';
import { UserModel } from '../users/user.model';
import { toPublicUser, type PublicUser } from '../users/user.service';

import { RefreshTokenModel } from './refreshToken.model';
import type { LoginInput, RegisterInput } from './auth.schemas';

export type SessionContext = { userAgent?: string; ip?: string };

export type AuthResult = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires, so the client can refresh early. */
  expiresIn: number;
};

const accessTtlSeconds = Math.floor(durationToMs(env.JWT_ACCESS_TTL) / 1000);

async function issueSession(
  userId: Types.ObjectId,
  tokenVersion: number,
  context: SessionContext,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const jti = newTokenId();
  const refreshToken = signRefreshToken(String(userId), jti);

  await RefreshTokenModel.create({
    userId,
    jti,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + durationToMs(env.JWT_REFRESH_TTL)),
    userAgent: context.userAgent?.slice(0, 256),
    ip: context.ip?.slice(0, 64),
  });

  return {
    accessToken: signAccessToken(String(userId), tokenVersion),
    refreshToken,
    expiresIn: accessTtlSeconds,
  };
}

export async function register(
  input: RegisterInput,
  context: SessionContext,
): Promise<AuthResult> {
  const existing = await UserModel.exists({ email: input.email });
  if (existing) {
    // The email is already known to whoever is asking — they typed it — so saying
    // so is not a disclosure. It is also the only message that lets someone who
    // forgot they had an account do the right thing.
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await withTransaction(async (session) => {
    const [created] = await UserModel.create(
      [
        {
          name: input.name,
          email: input.email,
          passwordHash,
          currency: input.currency,
        },
      ],
      { session, ordered: true },
    );

    if (!created) throw ApiError.internal('Could not create the account');

    // Categories and accounts are part of registering, not a follow-up step: a
    // half-seeded account would open on an empty picker with no way to recover.
    await seedUserDefaults(created._id, created.currency, session);

    return created;
  });

  const tokens = await issueSession(user._id, user.tokenVersion, context);
  return { user: toPublicUser(user), ...tokens };
}

export async function login(input: LoginInput, context: SessionContext): Promise<AuthResult> {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');

  if (!user) {
    // Spend the same time a real comparison would, then give the same answer a
    // wrong password gives. Otherwise the endpoint tells an attacker which of a
    // million addresses are registered, just by how fast it says no.
    await fakeVerify();
    throw ApiError.unauthorized('Email or password is incorrect');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw ApiError.unauthorized('Email or password is incorrect');

  const tokens = await issueSession(user._id, user.tokenVersion, context);
  return { user: toPublicUser(user), ...tokens };
}

/**
 * Rotating refresh: the presented token is spent and a fresh one is issued.
 *
 * Rotation is what makes a stolen refresh token detectable. A thief and the real
 * user both end up holding a token from the same chain, whichever of them uses
 * theirs second presents one that is already revoked — and that is the signal
 * below, which kills every session the user has rather than guessing which side
 * was the attacker.
 */
export async function refresh(token: string, context: SessionContext): Promise<AuthResult> {
  const claims = verifyRefreshToken(token);
  const stored = await RefreshTokenModel.findOne({ tokenHash: hashToken(token) });

  if (!stored) throw ApiError.unauthorized('Session expired, sign in again');

  if (stored.revokedAt) {
    logger.warn(
      { userId: String(stored.userId), jti: stored.jti },
      'refresh token reuse detected — revoking all sessions',
    );
    await RefreshTokenModel.updateMany(
      { userId: stored.userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw ApiError.unauthorized('Session ended for security, sign in again');
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized('Session expired, sign in again');
  }

  const user = await UserModel.findById(claims.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  const tokens = await issueSession(user._id, user.tokenVersion, context);

  const replacementJti = verifyRefreshToken(tokens.refreshToken).jti;
  stored.revokedAt = new Date();
  stored.replacedBy = replacementJti;
  await stored.save();

  return { user: toPublicUser(user), ...tokens };
}

/** Signing out revokes one session. The other devices stay signed in. */
export async function logout(token: string): Promise<void> {
  await RefreshTokenModel.updateOne(
    { tokenHash: hashToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

/** Sign out everywhere. Also called after a password change. */
export async function revokeAllSessions(userId: Types.ObjectId | string): Promise<void> {
  await RefreshTokenModel.updateMany(
    { userId: new Types.ObjectId(String(userId)), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
