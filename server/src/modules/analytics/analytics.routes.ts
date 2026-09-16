import { Router } from 'express';

import { ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';

import {
  overviewSchema,
  trendSchema,
  type OverviewQuery,
  type TrendQuery,
} from './analytics.schemas';
import { getMonthlyTrend, getOverview } from './analytics.service';

export const analyticsRouter: Router = Router();

analyticsRouter.use(requireAuth);

/**
 * Everything the Insights screen shows, and everything the assistant is allowed
 * to state, in one response.
 *
 * One request rather than eight because the figures have to agree with each
 * other: a savings rate fetched a second after the totals it is derived from can
 * disagree with them if a transaction lands in between, and a screen that
 * contradicts itself is worse than a slow one.
 */
analyticsRouter.get('/overview', validate({ query: overviewSchema }), async (req, res) => {
  const query = validatedQuery<OverviewQuery>(res);

  // Falls back to the window of equal length immediately before, which is the
  // only honest default for an arbitrary range.
  const span = query.to.getTime() - query.from.getTime();
  const previousTo = query.previousTo ?? new Date(query.from.getTime() - 1);
  const previousFrom = query.previousFrom ?? new Date(previousTo.getTime() - span);

  const overview = await getOverview(
    currentUser(req).id,
    { from: query.from, to: query.to },
    { from: previousFrom, to: previousTo },
    query.label,
  );

  ok(res, { overview });
});

analyticsRouter.get('/trend', validate({ query: trendSchema }), async (req, res) => {
  const { months } = validatedQuery<TrendQuery>(res);
  ok(res, { months: await getMonthlyTrend(currentUser(req).id, months) });
});
