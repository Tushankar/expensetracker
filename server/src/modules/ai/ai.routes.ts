import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Types } from 'mongoose';

import { env } from '../../config/env';
import { ErrorCode } from '../../lib/ApiError';
import { ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';
import { getOverview } from '../analytics/analytics.service';

import {
  answerQuestion,
  insightsFromOverview,
  suggestCategory,
  summaryFromOverview,
} from './ai.service';
import { proposeFromText } from './quick.service';
import {
  aiPeriodSchema,
  askSchema,
  categoriseSchema,
  chatHistorySchema,
  quickParseSchema,
  type AiPeriodQuery,
  type AskInput,
  type CategoriseInput,
  type ChatHistoryQuery,
  type QuickParseInput,
} from './ai.schemas';
import { AiMessageModel } from './aiMessage.model';
import { isAiConfigured, toApiError } from './groq.client';

export const aiRouter: Router = Router();

aiRouter.use(requireAuth);

/**
 * Per user, not per IP.
 *
 * Every call here costs a Groq request, and the thing worth limiting is one
 * account asking a hundred questions a minute — not a household sharing a
 * connection. Keyed on the authenticated id, which `requireAuth` has already
 * established by the time this runs.
 */
const aiLimiter = rateLimit({
  windowMs: env.AI_RATE_LIMIT_WINDOW_MS,
  limit: env.AI_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // `ipKeyGenerator` collapses an IPv6 address to its /64 prefix. The fallback is
  // only reachable if `requireAuth` somehow let a request through unauthenticated,
  // but a raw `req.ip` there would hand one caller billions of usable keys.
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? 'unknown'),
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: 'That is a lot of questions at once. Give it a moment.',
      },
    });
  },
});

aiRouter.use(aiLimiter);

/** Lets the app hide or explain the assistant rather than failing at it. */
aiRouter.get('/status', (_req, res) => {
  ok(res, {
    available: isAiConfigured(),
    model: isAiConfigured() ? env.GROQ_MODEL : null,
  });
});

function previousWindow(query: AiPeriodQuery): { from: Date; to: Date } {
  const span = query.to.getTime() - query.from.getTime();
  const to = query.previousTo ?? new Date(query.from.getTime() - 1);
  return { from: query.previousFrom ?? new Date(to.getTime() - span), to };
}

/**
 * The summary and the insight cards in one call.
 *
 * Both are written from the same overview, so they cannot contradict each other
 * — and computing that overview once rather than twice halves the aggregation
 * work on the screen's first paint.
 */
aiRouter.get('/summary', validate({ query: aiPeriodSchema }), async (req, res) => {
  const query = validatedQuery<AiPeriodQuery>(res);

  try {
    const overview = await getOverview(
      currentUser(req).id,
      { from: query.from, to: query.to },
      previousWindow(query),
      query.label,
    );

    const [summary, insights] = await Promise.all([
      summaryFromOverview(overview),
      insightsFromOverview(overview),
    ]);

    ok(res, { summary, insights: insights.insights, fromModel: insights.fromModel });
  } catch (error) {
    throw toApiError(error);
  }
});

aiRouter.post('/ask', validate({ body: askSchema }), async (req, res) => {
  const body = req.body as AskInput;
  const userId = currentUser(req).id;

  try {
    const answer = await answerQuestion(
      userId,
      body.question,
      { from: body.from, to: body.to },
      previousWindow(body),
      body.label,
    );

    // The transcript is written after the answer, so a failed question does not
    // leave a dangling turn in the history.
    await AiMessageModel.insertMany([
      { userId: new Types.ObjectId(userId), role: 'user', text: body.question, fromModel: false },
      {
        userId: new Types.ObjectId(userId),
        role: 'assistant',
        text: answer.text,
        context: answer.context,
        fromModel: answer.fromModel,
        limitedData: answer.limitedData,
      },
    ]);

    ok(res, { answer });
  } catch (error) {
    throw toApiError(error);
  }
});

aiRouter.get('/chat', validate({ query: chatHistorySchema }), async (req, res) => {
  const { limit } = validatedQuery<ChatHistoryQuery>(res);

  const rows = await AiMessageModel.find({ userId: new Types.ObjectId(currentUser(req).id) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean();

  ok(res, {
    // Oldest first, which is the order a transcript reads in.
    messages: rows.reverse().map((row) => ({
      id: String(row._id),
      role: row.role,
      text: row.text,
      context: row.context ?? {},
      fromModel: row.fromModel,
      limitedData: row.limitedData,
      createdAt: (row.createdAt ?? new Date()).toISOString(),
    })),
  });
});

aiRouter.delete('/chat', async (req, res) => {
  const result = await AiMessageModel.deleteMany({
    userId: new Types.ObjectId(currentUser(req).id),
  });
  ok(res, { deleted: result.deletedCount ?? 0 });
});

/**
 * Reads one line of shorthand into a proposed transaction. Writes nothing.
 *
 * The amount, the date and the payment method are found by rule, in
 * `quickEntry.ts`; only the category is ever inferred. A model that produced the
 * number would be a model nothing checked, on the one screen in this app where a
 * wrong figure gets saved rather than merely read.
 */
aiRouter.post('/parse', validate({ body: quickParseSchema }), async (req, res) => {
  const body = req.body as QuickParseInput;

  try {
    ok(res, { proposal: await proposeFromText(currentUser(req).id, body.text, body.type) });
  } catch (error) {
    throw toApiError(error);
  }
});

/**
 * Suggests a category. Writes nothing.
 *
 * The response is a proposal the app shows as a pre-selection with the reasoning
 * and a confidence next to it, and one tap changes it. An assistant that filed a
 * transaction on its own would put its mistakes into a chart six weeks later with
 * no way to trace them.
 */
aiRouter.post('/categorise', validate({ body: categoriseSchema }), async (req, res) => {
  const body = req.body as CategoriseInput;

  try {
    const suggestion = await suggestCategory(currentUser(req).id, body);
    ok(res, { suggestion });
  } catch (error) {
    throw toApiError(error);
  }
});
