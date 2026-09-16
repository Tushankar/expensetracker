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
