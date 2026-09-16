import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import { created, noContent, ok } from '../../lib/response';
import { getProfile } from '../users/user.service';

import * as authService from './auth.service';
import type { LoginInput, RefreshInput, RegisterInput } from './auth.schemas';

function contextFrom(req: Request): authService.SessionContext {
  return { userAgent: req.header('user-agent'), ip: req.ip };
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body as RegisterInput, contextFrom(req));
  created(res, result);
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput, contextFrom(req));
  ok(res, result);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshInput;
  const result = await authService.refresh(refreshToken, contextFrom(req));
  ok(res, result);
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshInput;
  // Always 200. Telling a caller that their token was already dead is a free
  // oracle, and there is nothing they could do differently either way.
  await authService.logout(refreshToken);
  noContent(res);
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  ok(res, { user: await getProfile(user.id) });
}
