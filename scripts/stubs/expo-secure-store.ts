/**
 * In-memory stand-in for the Keychain, so `client.test.ts` can run under Node.
 *
 * The real module is a native binding with no JS fallback — importing it outside
 * a React Native runtime throws. Everything the app actually uses is three async
 * string operations, which is all this provides.
 */
const store = new Map<string, string>();

export const AFTER_FIRST_UNLOCK = 'afterFirstUnlock';

export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function setItemAsync(
  key: string,
  value: string,
  _options?: { keychainAccessible?: string },
): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Test-only: empties the keychain between cases. */
export function __reset(): void {
  store.clear();
}
