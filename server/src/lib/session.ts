import mongoose, { type ClientSession } from 'mongoose';

import { supportsTransactions } from '../config/db';

/**
 * Runs `work` inside a Mongo transaction when the deployment has one.
 *
 * Every write that touches both a transaction document and an account balance goes
 * through here. Without it, a crash between "insert the expense" and "debit the
 * account" leaves a ledger that does not add up, and that is not a state you can
 * repair from the app.
 *
 * On a standalone `mongod` — no replica set, so no sessions — it degrades to
 * running the work unsessioned rather than refusing to start. That is a real
 * atomicity loss, which is why the fallback is limited to non-production topologies
 * and logged at boot.
 */
export async function withTransaction<T>(work: (session?: ClientSession) => Promise<T>): Promise<T> {
  if (!supportsTransactions()) return work(undefined);

  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    // `withTransaction` resolves only after the callback ran at least once.
    return result!;
  } finally {
    await session.endSession();
  }
}
