import path from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

// Loaded before anything reads process.env, and from this package's own directory
// so `npm start` works regardless of the shell's cwd.
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

/**
 * A JWT secret short enough to brute force is worse than no auth at all, because
 * it looks like auth. 32 characters is the floor, and the sample `.env` generates
 * 64.
 */
const secret = z.string().min(32, 'must be at least 32 characters');

/** Accepts `15m`, `7d`, `3600` — whatever `jsonwebtoken` understands. */
const duration = z.string().regex(/^\d+(ms|s|m|h|d|w|y)?$/, 'expected e.g. 15m, 7d or 3600');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  MONGODB_URI: z.string().min(1),

  JWT_ACCESS_SECRET: secret,
  JWT_REFRESH_SECRET: secret,
  JWT_ACCESS_TTL: duration.default('15m'),
  JWT_REFRESH_TTL: duration.default('30d'),

  CORS_ORIGINS: z.string().default('*'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  /**
   * The Groq key. Server-only, and the reason the assistant is a backend feature
   * rather than a client one: an `EXPO_PUBLIC_*` value is inlined into the
   * JavaScript bundle, and a bundle is a zip anyone can open.
   *
   * Optional. Without it every AI endpoint still answers — from the deterministic
   * summaries the analytics service produces — so the app degrades to plainer
   * wording rather than to an error.
   */
  GROQ_API_KEY: z.string().trim().optional(),
  GROQ_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  /** The conversational model: summaries, insights, answers. */
  GROQ_MODEL: z.string().trim().default('openai/gpt-oss-120b'),
  /**
   * A smaller model for the structured calls — intent extraction and
   * categorisation — where the job is classification, not prose, and latency is
   * felt directly in a keystroke.
   */
  GROQ_FAST_MODEL: z.string().trim().default('openai/gpt-oss-20b'),
  /**
   * A slow answer is worse than a plain one. Past this the request is abandoned
   * and the caller's deterministic fallback is used instead.
   */
  GROQ_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(15_000),

  /**
   * The model that reads receipts.
   *
   * Vision is a separate capability from prose, and not every Groq account has a
   * model that has it — `GET /models` is the authority, not the docs. Left as a
   * setting rather than hard-coded so a deployment can point at whatever its own
   * account actually offers.
   */
  GROQ_VISION_MODEL: z.string().trim().default('qwen/qwen3.8-27b'),
  /** Reading a receipt is slower than writing a sentence about one. */
  GROQ_VISION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(40_000),

  /** Assistant calls per user per window. Groq costs money and time. */
  AI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  /**
   * Cloudinary, for receipt images.
   *
   * The secret signs upload requests and never leaves this server: the app asks
   * for a signature, uploads straight to Cloudinary with it, and tells us the
   * result — which we verify against the same secret before believing a word of
   * it. Routing the bytes through this API instead would double the transfer and
   * turn a phone-side progress bar into a lie.
   *
   * All three are optional together. Without them receipts are unavailable and
   * the app says so, exactly as it does without a Groq key.
   */
  CLOUDINARY_CLOUD_NAME: z.string().trim().optional(),
  CLOUDINARY_API_KEY: z.string().trim().optional(),
  CLOUDINARY_API_SECRET: z.string().trim().optional(),
  /** Receipts are filed per user beneath this, so one listing cannot show another's. */
  CLOUDINARY_FOLDER: z.string().trim().default('paisa/receipts'),
  /** A phone camera JPEG is ~2-4MB. Ten is generous and still bounded. */
  RECEIPT_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  /** Uploads and extractions per user per window. */
  RECEIPT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RECEIPT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),

  /**
   * How often the recurring scheduler looks for work. Sixty seconds is far more
   * often than a monthly rule needs — the point is that a rule due at 9am fires
   * within a minute of 9am rather than whenever someone next opens the app.
   */
  RECURRING_INTERVAL_MS: z.coerce.number().int().min(5_000).default(60_000),
  /** Set false to run the API without the scheduler, e.g. a second instance. */
  RECURRING_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Fail at boot with the exact variable names, not at the first request with a
  // stack trace from three layers down.
  const lines = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
  console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  /** `*` means "reflect whatever origin asked", which is dev-only behaviour. */
  corsOrigins:
    raw.CORS_ORIGINS.trim() === '*'
      ? ('*' as const)
      : raw.CORS_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
} as const;

export type Env = typeof env;
