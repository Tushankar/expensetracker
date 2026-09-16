import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Merchant logos from LogoKit (https://logokit.com).
 *
 * The token is a *publishable* key: LogoKit issues these to be embedded in client
 * apps, and it ships inside the bundle whatever we do with it. A secret key
 * (`sk_…`, used by the Brand Data API) must never be put here — that belongs behind
 * the backend when one exists.
 */
/**
 * Read from the env var first. Metro inlines `process.env.EXPO_PUBLIC_*` into the
 * bundle on every platform; `expoConfig.extra` is only inlined on web, so relying
 * on it alone leaves the token undefined on device and every logo silently becomes
 * a monogram. The `extra` read stays as a fallback for EAS builds that set it there.
 *
 * This must stay a full static member expression — Metro cannot inline a
 * destructured or computed lookup.
 */
const token =
  process.env.EXPO_PUBLIC_LOGOKIT_TOKEN ??
  (Constants.expoConfig?.extra as { logoKitToken?: string } | undefined)?.logoKitToken;

/** Logo sizes the endpoint serves. Anything else is rounded up by the CDN. */
type LogoSize = 64 | 128 | 256;

/**
 * Headers for the logo request — native only, and deliberately so.
 *
 * `img.logokit.com` sits behind Cloudflare, which answers requests that do not look
 * like a browser fetching an image with a 403 challenge page instead of a PNG. On
 * iOS and Android the image loaders send their own platform defaults, so we set an
 * `Accept: image/*` explicitly.
 *
 * On web we must send nothing. The CDN returns no `Access-Control-Allow-Origin`, so
 * attaching any header promotes the load from a plain `<img>` fetch to a CORS
 * request, which the browser then blocks — every logo silently falls back to a
 * monogram. Left alone, the browser's own Accept header already satisfies
 * Cloudflare.
 */
export const LOGO_REQUEST_HEADERS: Record<string, string> | undefined =
  Platform.OS === 'web' ? undefined : { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' };

/**
 * URL for a merchant's logo, or null when there is nothing to ask for — the caller
 * falls back to a monogram.
 *
 * `fallback=404` is deliberate: LogoKit can generate its own monogram, but ours is
 * themed, works offline and matches the rest of the app, so we would rather have
 * the miss and draw it locally.
 */
export function merchantLogoUrl(domain: string | undefined, size: LogoSize = 128): string | null {
  if (!domain || !token) return null;
  return `https://img.logokit.com/${encodeURIComponent(domain)}?token=${token}&size=${size}&fallback=404`;
}

/** Whether logo fetching is configured at all. */
export const logosEnabled = Boolean(token);
