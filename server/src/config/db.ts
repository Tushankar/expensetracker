import mongoose from 'mongoose';

import { env } from './env';
import { logger } from './logger';

/**
 * Whether the deployment can run multi-document transactions.
 *
 * Balance updates must be atomic with the transaction write, which needs a session,
 * which needs a replica set. Atlas always gives you one; a bare local `mongod` does
 * not. Rather than fail on a developer's laptop, we detect it once at boot and fall
 * back to unsessioned writes there — see `withTransaction` in `lib/session.ts`.
 */
let transactionsSupported = false;

export function supportsTransactions(): boolean {
  return transactionsSupported;
}

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  // An unindexed query on a growing transactions collection is the classic way an
  // app gets slow in month three. Build indexes in development so they are visible.
  mongoose.set('autoIndex', !env.isProduction);

  mongoose.connection.on('error', (error) => logger.error({ err: error }, 'mongo connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('mongo disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('mongo reconnected'));

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15_000,
    maxPoolSize: 20,
    retryWrites: true,
  });

  // `topologyDescription` is populated once the driver has pinged the deployment.
  const topology = (mongoose.connection.getClient() as unknown as {
    topology?: { description?: { type?: string } };
  }).topology?.description?.type;

  transactionsSupported = topology === 'ReplicaSetWithPrimary' || topology === 'Sharded';

  logger.info(
    { db: mongoose.connection.name, topology, transactionsSupported },
    'mongo connected',
  );
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
