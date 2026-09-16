import { Router } from 'express';

import { requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';

import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
} from './auth.controller';
import { loginSchema, refreshSchema, registerSchema } from './auth.schemas';

export const authRouter: Router = Router();

// The tight limiter goes only on the endpoints worth guessing at. Putting it on
// `/me` would throttle a legitimately busy client for no security gain.
authRouter.post('/register', authLimiter, validate({ body: registerSchema }), registerHandler);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), loginHandler);
authRouter.post('/refresh', authLimiter, validate({ body: refreshSchema }), refreshHandler);
authRouter.post('/logout', validate({ body: refreshSchema }), logoutHandler);
authRouter.get('/me', requireAuth, meHandler);
