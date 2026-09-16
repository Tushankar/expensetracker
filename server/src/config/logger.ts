import pino from 'pino';

import { env } from './env';

/**
 * One logger for the whole process. Pretty-printed in development because a wall
 * of JSON is unreadable in a terminal; raw JSON in production because that is what
 * log aggregators parse.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  redact: {
    // These show up in request bodies and headers, and a password in a log file is
    // a breach whether or not anyone reads it.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.currentPassword',
      'req.body.newPassword',
      'req.body.refreshToken',
      'password',
      'passwordHash',
      'refreshToken',
    ],
    censor: '[redacted]',
  },
  transport: env.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});
