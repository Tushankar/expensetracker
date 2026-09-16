import { Router } from 'express';
import { z } from 'zod';

import { noContent, ok } from '../../lib/response';
import { objectId } from '../accounts/account.schemas';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';

import {
  clearAll,
  countUnread,
  listNotifications,
  markAllRead,
  markRead,
  registerDevice,
  unregisterDevice,
} from './notification.service';

export const notificationRouter: Router = Router();

notificationRouter.use(requireAuth);

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

notificationRouter.get('/', validate({ query: listSchema }), async (req, res) => {
  const query = validatedQuery<z.infer<typeof listSchema>>(res);
  const { notifications, meta, unread } = await listNotifications(currentUser(req).id, query);
  ok(res, { notifications, unread }, meta);
});

/**
 * Just the badge number.
 *
 * Separate from the list because the app polls this on focus and the list is
 * pages of rows nobody is looking at — a count is one indexed `countDocuments`.
 */
notificationRouter.get('/unread-count', async (req, res) => {
  ok(res, { unread: await countUnread(currentUser(req).id) });
});

notificationRouter.post('/read-all', async (req, res) => {
  ok(res, { updated: await markAllRead(currentUser(req).id) });
});

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

/**
 * Device registration for push.
 *
 * The token is stored now so that turning push on later is a change inside
 * `deliver()` and nothing else — the client already has somewhere to hand its
 * token to, and the server already knows which devices belong to whom.
 */
const deviceSchema = z.object({ token: z.string().trim().min(10).max(256) });

notificationRouter.post('/device', validate({ body: deviceSchema }), async (req, res) => {
  const { token } = req.body as z.infer<typeof deviceSchema>;
  await registerDevice(currentUser(req).id, token);
  noContent(res);
});

notificationRouter.delete('/device', validate({ body: deviceSchema }), async (req, res) => {
  const { token } = req.body as z.infer<typeof deviceSchema>;
  await unregisterDevice(currentUser(req).id, token);
  noContent(res);
});
