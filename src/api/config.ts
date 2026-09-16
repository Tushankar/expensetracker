import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Port the API listens on. Matches `PORT` in `server/.env`. */
const API_PORT = 4000;

/**
 * Where the API lives, resolved in the order that makes the app work without
 * anyone editing a file.
 *
 * 1. `EXPO_PUBLIC_API_URL`, for a real deployment or a tunnel.
 * 2. The host serving this bundle. On a phone `localhost` is the *phone*, so a
 *    hard-coded one fails on every device that is not the simulator. Expo already
 *    knows the LAN address the dev server is reachable at — it is how the bundle
 *    got here — so reusing it means a physical device works with no setup.
 * 3. Localhost, for the iOS simulator and web. Android's emulator reaches the
 *    host machine at 10.0.2.2 rather than 127.0.0.1.
 */
function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];

  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${API_PORT}/api/v1`;
  }

  const fallback = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${fallback}:${API_PORT}/api/v1`;
}

export const API_BASE_URL = resolveBaseUrl();

/**
 * A request that has not answered in this long is treated as a network failure.
 *
 * Without it a request against an unreachable host can sit pending until the OS
 * gives up, which on Android is well over a minute of spinner with no way out.
 */
export const REQUEST_TIMEOUT_MS = 15_000;
