import bcrypt from 'bcryptjs';

/**
 * bcrypt at cost 12 — roughly 250ms per hash on a modern server, which is the
 * usual balance between "slow enough to make an offline crack expensive" and
 * "fast enough that a login does not feel broken".
 *
 * `bcryptjs` rather than native `bcrypt` or `argon2` on purpose: both of those
 * need a node-gyp toolchain, and a dependency that fails to build on a
 * contributor's machine is a dependency that gets swapped for something worse.
 */
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Burns the same time a real comparison would when the account does not exist.
 * Without it, "no such user" answers measurably faster than "wrong password" and
 * the endpoint becomes an email enumeration oracle.
 */
export async function fakeVerify(): Promise<void> {
  await bcrypt.compare(
    'not-a-real-password',
    '$2b$12$C6UzMDM.H6dfI/f/IKcEe.CfE0Tk/AVWuE8YQ0/4KeSSSCxu3aFSu',
  );
}
