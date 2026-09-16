import type { NextFunction, Request, Response } from 'express';

import { ApiError } from '../lib/ApiError';
import { verifyAccessToken } from '../lib/tokens';
import { UserModel } from '../modules/users/user.model';

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  currency: string;
};

/**
 * The only place a user identity enters the system.
 *
 * Identity comes from the signature on the access token — never from a `userId`
 * in the body, the query string or a header. A mobile client is an untrusted
 * input source in exactly the same way a browser is: anyone can point a debug
 * build at the API and send whatever id they like. Every service function takes
 * the user id as its first argument and scopes its query by it, so a wrong id
 * cannot read another account's rows even if one leaked in.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing access token');
    }

    const claims = verifyAccessToken(header.slice(7).trim());

    // Hitting the database on every request costs a round trip, but it is what
    // makes a deleted account and a password change take effect immediately
    // rather than at the end of the access token's 15-minute life.
    const user = await UserModel.findById(claims.sub)
      .select('name email currency tokenVersion')
      .lean();

    if (!user) throw ApiError.unauthorized('Account no longer exists');

    if (user.tokenVersion !== claims.tv) {
      throw ApiError.unauthorized('Session ended, sign in again');
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      currency: user.currency,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/** Narrowing helper so handlers get a non-optional user without a cast. */
export function currentUser(req: Request): AuthenticatedUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
