import { Router } from 'express';
import { z } from 'zod';

import { ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { deleteDevice, listDevices, registerDevice } from './notification.service';
import { registerDeviceSchema } from './notification.schemas';

export const deviceRouter: Router = Router();

deviceRouter.use(requireAuth);

deviceRouter.get('/', async (req, res) => {
  const devices = await listDevices(currentUser(req).id);
  ok(res, { devices });
});

deviceRouter.post('/register', validate({ body: registerDeviceSchema }), async (req, res) => {
  const body = req.body as z.infer<typeof registerDeviceSchema>;
  const result = await registerDevice(currentUser(req).id, body.token, body.platform, body.deviceId);
  ok(res, result);
});

deviceRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteDevice(currentUser(req).id, String(req.params.id));
  ok(res, { deleted });
});
