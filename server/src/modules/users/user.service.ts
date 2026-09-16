import { Types } from 'mongoose';

import { ApiError } from '../../lib/ApiError';
import { hashPassword, verifyPassword } from '../../lib/password';
import { revokeAllSessions } from '../auth/auth.service';

import { UserModel, type UserDocument } from './user.model';

/**
 * What a user is allowed to see about themselves. Everything not listed here —
 * `passwordHash`, `tokenVersion` — never leaves the process, and building the
 * shape explicitly is what guarantees that a field added to the schema later does
 * not quietly start appearing in responses.
 */
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

type UserLike = Pick<UserDocument, 'name' | 'email' | 'currency'> & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    currency: user.currency,
    createdAt: (user.createdAt ?? new Date()).toISOString(),
    updatedAt: (user.updatedAt ?? new Date()).toISOString(),
  };
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await UserModel.findById(userId);
  if (!user) throw ApiError.notFound('Account not found');
  return toPublicUser(user);
}

export async function updateProfile(
  userId: string,
  patch: { name?: string; currency?: string },
): Promise<PublicUser> {
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: patch },
    { new: true, runValidators: true },
  );
  if (!user) throw ApiError.notFound('Account not found');
  return toPublicUser(user);
}

/**
 * Changing a password ends every session, including this one.
 *
 * Bumping `tokenVersion` is what makes that immediate: access tokens carry the
 * version they were signed with, so the up-to-15-minute window a purely stateless
 * JWT would leave open closes at once. That window is exactly when it matters —
 * the usual reason to change a password is that someone else has it.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw ApiError.badRequest('Current password is incorrect', [
      { field: 'currentPassword', message: 'That is not your current password' },
    ]);
  }

  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw ApiError.badRequest('Choose a password you have not used here before', [
      { field: 'newPassword', message: 'This is your current password' },
    ]);
  }

  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion += 1;
  await user.save();

  await revokeAllSessions(user._id);
}
