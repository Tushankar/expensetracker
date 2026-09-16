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

// The tight limiter goes only where a secret can be guessed. Refresh and logout
// carry no email, so it would key them by bare IP and put everyone behind one NAT
// in a single bucket — see the note in `middleware/rateLimit.ts`.
authRouter.post('/register', authLimiter, validate({ body: registerSchema }), registerHandler);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), loginHandler);
authRouter.post('/refresh', validate({ body: refreshSchema }), refreshHandler);
authRouter.post('/logout', validate({ body: refreshSchema }), logoutHandler);
authRouter.get('/me', requireAuth, meHandler);
