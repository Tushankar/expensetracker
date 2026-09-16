import { Types } from 'mongoose';

import { ApiError } from '../../lib/ApiError';
import { hashPassword, verifyPassword } from '../../lib/password';
import { DEFAULT_TIMEZONE, isValidTimezone } from '../../lib/time';
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
  /** IANA zone. Every server-computed boundary uses it — see `lib/time.ts`. */
  timezone: string;
  notificationPrefs: { budgetAlerts: boolean; recurringAlerts: boolean };
  createdAt: string;
  updatedAt: string;
};

type UserLike = Pick<UserDocument, 'name' | 'email' | 'currency'> & {
  _id: Types.ObjectId;
  timezone?: string;
  notificationPrefs?: { budgetAlerts?: boolean; recurringAlerts?: boolean } | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    currency: user.currency,
    timezone: user.timezone ?? DEFAULT_TIMEZONE,
    notificationPrefs: {
      budgetAlerts: user.notificationPrefs?.budgetAlerts ?? true,
      recurringAlerts: user.notificationPrefs?.recurringAlerts ?? true,
    },
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
  patch: {
    name?: string;
    currency?: string;
    timezone?: string;
    notificationPrefs?: { budgetAlerts?: boolean; recurringAlerts?: boolean };
  },
): Promise<PublicUser> {
  // A zone this build cannot resolve would make every budget month and every
  // recurring date silently wrong, so it is refused rather than stored.
  if (patch.timezone !== undefined && !isValidTimezone(patch.timezone)) {
    throw ApiError.badRequest('That is not a time zone we recognise', [
      { field: 'timezone', message: 'Expected an IANA zone like Asia/Kolkata' },
    ]);
  }

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.timezone !== undefined) update.timezone = patch.timezone;
  // Dotted paths so sending one switch does not wipe the other.
  if (patch.notificationPrefs?.budgetAlerts !== undefined) {
    update['notificationPrefs.budgetAlerts'] = patch.notificationPrefs.budgetAlerts;
  }
  if (patch.notificationPrefs?.recurringAlerts !== undefined) {
    update['notificationPrefs.recurringAlerts'] = patch.notificationPrefs.recurringAlerts;
  }

  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: update },
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
