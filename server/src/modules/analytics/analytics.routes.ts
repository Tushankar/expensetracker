import { Router } from 'express';

import {
  dayRange,
  monthRange,
  weekRange,
  yearRange,
  zoneOrDefault,
} from '../../lib/time';
import { ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';
import { UserModel } from '../users/user.model';

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
  const userId = currentUser(req).id;
  const user = await UserModel.findById(userId).select('timezone').lean();
  const timezone = zoneOrDefault(user?.timezone);

  let fromDate: Date;
  let toDate: Date;
  let label = query.label ?? 'this period';

  const now = new Date();
  if (query.period === 'week') {
    const range = weekRange(now, timezone);
    fromDate = range.from;
    toDate = range.to;
    label = query.label ?? 'this week';
  } else if (query.period === 'month') {
    const range = monthRange(now, timezone);
    fromDate = range.from;
    toDate = range.to;
    label = query.label ?? 'this month';
  } else if (query.period === 'year') {
    const range = yearRange(now, timezone);
    fromDate = range.from;
    toDate = range.to;
    label = query.label ?? 'this year';
  } else if (query.period === 'day') {
    const range = dayRange(now, timezone);
    fromDate = range.from;
    toDate = range.to;
    label = query.label ?? 'today';
  } else {
    const rawFrom = query.from ?? query.startDate;
    const rawTo = query.to ?? query.endDate;
    if (rawFrom && rawTo) {
      fromDate = rawFrom;
      toDate = rawTo;
    } else {
      const range = monthRange(now, timezone);
      fromDate = range.from;
      toDate = range.to;
      label = query.label ?? 'this month';
    }
  }

  // Falls back to the window of equal length immediately before, which is the
  // only honest default for an arbitrary range.
  const span = toDate.getTime() - fromDate.getTime();
  const previousTo = query.previousTo ?? new Date(fromDate.getTime() - 1);
  const previousFrom = query.previousFrom ?? new Date(previousTo.getTime() - span);

  const overview = await getOverview(
    userId,
    { from: fromDate, to: toDate },
    { from: previousFrom, to: previousTo },
    label,
  );

  ok(res, { overview });
});

analyticsRouter.get('/trend', validate({ query: trendSchema }), async (req, res) => {
  const { months } = validatedQuery<TrendQuery>(res);
  ok(res, { months: await getMonthlyTrend(currentUser(req).id, months) });
});
