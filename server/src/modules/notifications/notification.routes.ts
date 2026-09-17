import { Router } from 'express';
import { z } from 'zod';

import { noContent, ok } from '../../lib/response';
import { objectId } from '../accounts/account.schemas';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';

import {
  clearAll,
  countUnread,
  getNotificationPreferences,
  listNotifications,
  markAllRead,
  markRead,
  registerDevice,
  unregisterDevice,
  updateNotificationPreferences,
} from './notification.service';
import {
  listNotificationsQuerySchema,
  registerDeviceSchema,
  unregisterDeviceSchema,
  updateNotificationPreferencesSchema,
} from './notification.schemas';
import { runAllAlertsForUser } from './alertEngine';

export const notificationRouter: Router = Router();

notificationRouter.use(requireAuth);

notificationRouter.get('/', validate({ query: listNotificationsQuerySchema }), async (req, res) => {
  const query = validatedQuery<z.infer<typeof listNotificationsQuerySchema>>(res);
  const { notifications, meta, unread } = await listNotifications(currentUser(req).id, query);
  ok(res, { notifications, unread }, meta);
});

/**
 * Just the badge number.
 */
notificationRouter.get('/unread-count', async (req, res) => {
  ok(res, { unread: await countUnread(currentUser(req).id) });
});

notificationRouter.post('/read-all', async (req, res) => {
  ok(res, { updated: await markAllRead(currentUser(req).id) });
});

// Support both PATCH and POST for marking read
notificationRouter.patch(
  '/:id/read',
  validate({ params: z.object({ id: objectId }) }),
  async (req, res) => {
    ok(res, { notification: await markRead(currentUser(req).id, String(req.params.id)) });
  },
);

notificationRouter.post(
  '/:id/read',
  validate({ params: z.object({ id: objectId }) }),
  async (req, res) => {
    ok(res, { notification: await markRead(currentUser(req).id, String(req.params.id)) });
  },
);

notificationRouter.delete('/', async (req, res) => {
  ok(res, { deleted: await clearAll(currentUser(req).id) });
});

// Preferences
notificationRouter.get('/preferences', async (req, res) => {
  const preferences = await getNotificationPreferences(currentUser(req).id);
  ok(res, { preferences });
});

notificationRouter.patch(
  '/preferences',
  validate({ body: updateNotificationPreferencesSchema }),
  async (req, res) => {
    const preferences = await updateNotificationPreferences(
      currentUser(req).id,
      req.body as z.infer<typeof updateNotificationPreferencesSchema>,
    );
    ok(res, { preferences });
  },
);

// Device registration
notificationRouter.post('/device', validate({ body: registerDeviceSchema }), async (req, res) => {
  const body = req.body as z.infer<typeof registerDeviceSchema>;
  const result = await registerDevice(currentUser(req).id, body.token, body.platform, body.deviceId);
  ok(res, result);
});

notificationRouter.delete('/device', validate({ body: unregisterDeviceSchema }), async (req, res) => {
  const { token } = req.body as z.infer<typeof unregisterDeviceSchema>;
  await unregisterDevice(currentUser(req).id, token);
  noContent(res);
});

// Test / On-demand trigger for running alerts
notificationRouter.post('/run-alerts', async (req, res) => {
  const result = await runAllAlertsForUser(currentUser(req).id);
  ok(res, { result });
});
