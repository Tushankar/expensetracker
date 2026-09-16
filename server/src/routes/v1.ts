import { Router } from 'express';
import mongoose from 'mongoose';

import { ok } from '../lib/response';
import { accountRouter } from '../modules/accounts/account.routes';
import { aiRouter } from '../modules/ai/ai.routes';
import { analyticsRouter } from '../modules/analytics/analytics.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { budgetRouter } from '../modules/budgets/budget.routes';
import { categoryRouter } from '../modules/categories/category.routes';
import { notificationRouter } from '../modules/notifications/notification.routes';
import { recurringRouter } from '../modules/recurring/recurring.routes';
import { transactionRouter } from '../modules/transactions/transaction.routes';
import { userRouter } from '../modules/users/user.routes';

/**
 * Everything is mounted under `/api/v1`. The version is in the path rather than a
 * header so that a breaking change ships as `/api/v2` alongside the old routes and
 * an app store release that nobody has installed yet keeps working.
 */
export const v1Router: Router = Router();

v1Router.get('/health', (_req, res) => {
  const states: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  ok(res, {
    status: 'ok',
    database: states[mongoose.connection.readyState] ?? 'unknown',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

v1Router.use('/auth', authRouter);
v1Router.use('/users', userRouter);
v1Router.use('/accounts', accountRouter);
v1Router.use('/categories', categoryRouter);
v1Router.use('/transactions', transactionRouter);
v1Router.use('/budgets', budgetRouter);
v1Router.use('/recurring', recurringRouter);
v1Router.use('/notifications', notificationRouter);
v1Router.use('/analytics', analyticsRouter);
v1Router.use('/ai', aiRouter);
