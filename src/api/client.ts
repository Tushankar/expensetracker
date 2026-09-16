import { useAuthStore } from '@/store/authStore';

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config';
import { ApiError, NetworkError, type FieldIssue } from './errors';
import type { AuthSession } from './types';

type Envelope<T> = {
  success: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string; issues?: FieldIssue[] };
};

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Query parameters. Undefined and empty values are dropped. */
  params?: Record<string, string | number | boolean | undefined | null>;
  /** Off for sign-in and register, which have no token yet. */
  auth?: boolean;
  signal?: AbortSignal;
};

/** The parsed body plus the envelope's `meta`, for paginated reads. */
export type ApiResult<T> = { data: T; meta?: Record<string, unknown> };

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = `${API_BASE_URL}${path}`;
  if (!params) return url;

  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return query ? `${url}?${query}` : url;
}

/**
 * One fetch, with a timeout and no retry logic.
 *
 * Anything that is not a parseable envelope becomes a `NetworkError`, including a
 * proxy's HTML error page and a server that is simply not running — from the UI's
 * point of view those are the same problem with the same fix.
 */
async function rawFetch<T>(url: string, init: RequestInit, signal?: AbortSignal): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // A caller that aborts (a screen unmounting, a search superseded) must also
  // cancel the underlying request, not just stop listening to it.
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new NetworkError(
      controller.signal.aborted
        ? 'The server took too long to respond'
        : 'Cannot reach the server. Check your connection.',
      error,
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }

  const text = await response.text();

  let envelope: Envelope<T>;
  try {
    envelope = JSON.parse(text) as Envelope<T>;
  } catch {
    throw new NetworkError('The server sent an unexpected response');
  }

  if (!response.ok || !envelope.success) {
    throw new ApiError(
      response.status,
      envelope.error?.code ?? 'UNKNOWN',
      envelope.error?.message ?? 'Something went wrong',
      envelope.error?.issues ?? [],
    );
  }

  return { data: envelope.data as T, meta: envelope.meta };
}

/**
 * The in-flight refresh, if there is one.
 *
 * An app that opens on Home fires four queries at once. With an expired access
 * token, all four get a 401 within milliseconds of each other — and four parallel
 * refreshes against a *rotating* endpoint means three of them present a token the
 * first one has already spent, which the server correctly reads as theft and
 * responds to by killing every session. Sharing one promise is not an
 * optimisation; without it the app signs itself out.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');

    try {
      const { data } = await rawFetch<AuthSession>(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      await useAuthStore.getState().updateTokens(data.accessToken, data.refreshToken);
      await useAuthStore.getState().updateUser(data.user);
      return data.accessToken;
    } catch (error) {
      // A refresh that the *server* rejected means the session is over. A network
      // failure does not — the token may well still be good — so the user keeps
      // their session and the request simply fails.
      if (error instanceof ApiError) {
        await useAuthStore.getState().signOut('Your session expired. Sign in again.');
      }
      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, params, auth = true, signal } = options;
  const url = buildUrl(path, params);

  const send = (token: string | null): Promise<ApiResult<T>> =>
    rawFetch<T>(
      url,
      {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      signal,
    );

  if (!auth) return send(null);

  const token = useAuthStore.getState().accessToken;

  try {
    return await send(token);
  } catch (error) {
    // Exactly one retry, and only for the one failure a retry can fix. Retrying a
    // 403 or a 409 would just send the same wrong request twice.
    const expired =
      error instanceof ApiError &&
      error.status === 401 &&
      (error.code === 'TOKEN_EXPIRED' || error.code === 'UNAUTHORIZED');

    if (!expired) throw error;

    const fresh = await refreshAccessToken();
    return send(fresh);
  }
}

/** Convenience wrapper for the common case of a call with no `meta`. */
export async function requestData<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await request<T>(path, options)).data;
}
