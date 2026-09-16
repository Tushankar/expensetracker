import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the session tokens live.
 *
 * On iOS and Android that is the Keychain / Keystore via `expo-secure-store`:
 * encrypted at rest, sandboxed to this app, and not included in a plaintext
 * backup. A refresh token is a month-long credential, so `AsyncStorage` — an
 * unencrypted SQLite file readable on a rooted device — is not good enough.
 *
 * SecureStore has no web implementation. The web build falls back to
 * `localStorage`, which is genuinely weaker; it is fine for a dev build in a
 * browser and is why the real product ships as the native app.
 */

const isWeb = Platform.OS === 'web';

export async function getSecureItem(key: string): Promise<string | null> {
  try {
    if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    // A keychain that refuses to open should sign the user out, not crash the
    // app on launch.
    return null;
  }
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    if (isWeb) {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value, {
      // Readable whenever the device has been unlocked once since boot, so a
      // background refresh does not fail on a locked phone.
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  } catch {
    // Nothing useful to do: the app keeps the token in memory for this session
    // and the user signs in again next launch.
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  try {
    if (isWeb) {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Already gone is the outcome we wanted.
  }
}
