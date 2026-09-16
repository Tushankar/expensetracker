import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { requestId, requestLogger } from './middleware/requestContext';
import { v1Router } from './routes/v1';

function corsOptions(): CorsOptions {
  if (env.corsOrigins === '*') {
    // Reflects whatever origin asked. Fine for a mobile client — a native app has
    // no origin and CORS does not apply to it — and fine in development, but it is
    // why `CORS_ORIGINS` must be an explicit list in production.
    return { origin: true, credentials: false };
  }

  const allowed = new Set(env.corsOrigins);
  return {
    origin(origin, callback) {
      // No Origin header at all: a native app, curl, a server-to-server call.
      // There is no browser to protect, so there is nothing to refuse.
      if (!origin || allowed.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: false,
  };
}

export function createApp(): Express {
  const app = express();

  // Behind a proxy (Render, Fly, nginx) `req.ip` is the proxy's address without
  // this, which would key every rate limit to one bucket for the whole internet.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors(corsOptions()));
  app.use(requestId);
  app.use(requestLogger);

  // A transaction is a few hundred bytes. The cap is what stops a single request
  // from parking megabytes in the process heap.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use('/api', apiLimiter);
  app.use('/api/v1', v1Router);

  // Unversioned probe, so a load balancer's health check does not have to know
  // which API versions exist.
  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
