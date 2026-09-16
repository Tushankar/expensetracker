import type { Server } from 'node:http';

import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';

async function main(): Promise<void> {
  // Connect first. A server that accepts requests before the database is up
  // answers the first few with a 500 and looks broken on every cold start.
  await connectDatabase();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, base: `http://localhost:${env.PORT}/api/v1` },
      'paisa api listening',
    );
  });

  /**
   * Stop taking new connections, let in-flight requests finish, then close the
   * database. A hard exit here can abort a request between writing a transaction
   * and updating the balance behind it.
   */
  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'shutting down');

    const forced = setTimeout(() => {
      logger.error('shutdown timed out, exiting');
      process.exit(1);
    }, 10_000);
    forced.unref();

    server.close(async () => {
      await disconnectDatabase();
      clearTimeout(forced);
      process.exit(0);
    });
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // A promise nobody handled has left the process in a state it did not plan for.
  // Log it loudly and let the supervisor restart rather than carry on half-broken.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled rejection');
    process.exit(1);
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    process.exit(1);
  });
}

void main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'failed to start');
  process.exit(1);
});
