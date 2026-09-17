import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { noContent, ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { passwordSchema } from '../auth/auth.schemas';

import { deleteUserAccount } from './deletion.service';
import { changePassword, getProfile, updateProfile } from './user.service';

export const userRouter: Router = Router();

userRouter.use(requireAuth);

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    currency: z.string().trim().toUpperCase().length(3).optional(),
    /** Validated against the runtime's zone database in the service. */
    timezone: z.string().trim().min(1).max(64).optional(),
    notificationPrefs: z
      .object({
        budgetAlerts: z.boolean().optional(),
        recurringAlerts: z.boolean().optional(),
      })
      .optional(),
  })
  // An empty PATCH is a client bug, and silently returning the unchanged user
  // hides it until someone wonders why the name never saves.
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update',
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(72),
  newPassword: passwordSchema,
});

/**
 * There is no `:id` route here on purpose. A user only ever reads or writes
 * themselves, and the identity comes from the token — so there is no id for a
 * client to tamper with in the first place.
 */
userRouter.get('/me', async (req: Request, res: Response) => {
  ok(res, { user: await getProfile(currentUser(req).id) });
});

userRouter.patch('/me', validate({ body: updateProfileSchema }), async (req, res) => {
  const patch = req.body as z.infer<typeof updateProfileSchema>;
  ok(res, { user: await updateProfile(currentUser(req).id, patch) });
});

userRouter.post('/me/password', validate({ body: changePasswordSchema }), async (req, res) => {
  const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
  await changePassword(currentUser(req).id, currentPassword, newPassword);
  noContent(res);
});

const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm').max(72),
  /**
   * A typed confirmation, checked on the server rather than only in the app.
   *
   * The app asks for it too, but a destructive endpoint that can be triggered by
   * a single malformed request is a destructive endpoint waiting to be triggered
   * by one.
   */
  confirm: z.literal('DELETE'),
});

/**
 * Deletes the account and everything in it. Cannot be undone.
 *
 * Password-confirmed, because a stolen access token should not be enough to
 * destroy someone's records — and every session dies with the account, so the
 * token used to make this call stops working the moment it succeeds.
 */
userRouter.delete('/me', validate({ body: deleteAccountSchema }), async (req, res) => {
  const { password } = req.body as z.infer<typeof deleteAccountSchema>;
  ok(res, { deleted: await deleteUserAccount(currentUser(req).id, password) });
});
