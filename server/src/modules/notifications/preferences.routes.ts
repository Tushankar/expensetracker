import { Router } from 'express';
import { z } from 'zod';

import { ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getNotificationPreferences, updateNotificationPreferences } from './notification.service';
import { updateNotificationPreferencesSchema } from './notification.schemas';

export const notificationPreferencesRouter: Router = Router();

notificationPreferencesRouter.use(requireAuth);

notificationPreferencesRouter.get('/', async (req, res) => {
  const preferences = await getNotificationPreferences(currentUser(req).id);
  ok(res, { preferences });
});

notificationPreferencesRouter.patch(
  '/',
  validate({ body: updateNotificationPreferencesSchema }),
  async (req, res) => {
    const preferences = await updateNotificationPreferences(
      currentUser(req).id,
      req.body as z.infer<typeof updateNotificationPreferencesSchema>,
    );
    ok(res, { preferences });
  },
);
