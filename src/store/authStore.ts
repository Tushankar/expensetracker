import { create } from 'zustand';

import type { AuthSession, User } from '@/api/types';

import { deleteSecureItem, getSecureItem, setSecureItem } from './secureStorage';

const ACCESS_KEY = 'paisa.accessToken';
const REFRESH_KEY = 'paisa.refreshToken';
const USER_KEY = 'paisa.user';

export type AuthStatus =
  /** Reading the keychain on launch. The app shows nothing yet. */
  | 'restoring'
  | 'signedOut'
  | 'signedIn';

type AuthState = {
  status: AuthStatus;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Set when the session ended on its own, so sign-in can say why. */
  expiredReason: string | null;

  restore: () => Promise<void>;
  signIn: (session: AuthSession) => Promise<void>;
  /** Called by the API client after a successful token rotation. */
  updateTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  signOut: (reason?: string) => Promise<void>;
  clearExpiredReason: () => void;
};

/**
 * The session, and the only thing in the app that knows how to persist one.
 *
 * Deliberately free of network code: the API client reads this store, the store
 * never calls the API. That keeps the dependency pointing one way, which is what
 * lets `client.ts` refresh a token without importing a module that imports it
 * back.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'restoring',
  user: null,
  accessToken: null,
  refreshToken: null,
  expiredReason: null,

  async restore() {
    const [accessToken, refreshToken, rawUser] = await Promise.all([
      getSecureItem(ACCESS_KEY),
      getSecureItem(REFRESH_KEY),
      getSecureItem(USER_KEY),
    ]);

    // The refresh token is what makes a session restorable. An access token
    // without one is a session that dies in fifteen minutes with no way back, so
    // it is treated as no session at all.
    if (!refreshToken) {
      set({ status: 'signedOut', user: null, accessToken: null, refreshToken: null });
      return;
    }

    let user: User | null = null;
    try {
      user = rawUser ? (JSON.parse(rawUser) as User) : null;
    } catch {
      user = null;
    }

    // The cached user renders the first frame; `useSession` refetches it so a
    // name changed on another device corrects itself a moment later.
    set({ status: 'signedIn', accessToken, refreshToken, user });
  },

  async signIn(session) {
    set({
      status: 'signedIn',
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiredReason: null,
    });
    await Promise.all([
      setSecureItem(ACCESS_KEY, session.accessToken),
      setSecureItem(REFRESH_KEY, session.refreshToken),
      setSecureItem(USER_KEY, JSON.stringify(session.user)),
    ]);
  },

  async updateTokens(accessToken, refreshToken) {
    // A rotation that arrives after sign-out must not resurrect the session.
    if (get().status !== 'signedIn') return;
    set({ accessToken, refreshToken });
    await Promise.all([
      setSecureItem(ACCESS_KEY, accessToken),
      setSecureItem(REFRESH_KEY, refreshToken),
    ]);
  },

  async updateUser(user) {
    set({ user });
    await setSecureItem(USER_KEY, JSON.stringify(user));
  },

  async signOut(reason) {
    set({
      status: 'signedOut',
      user: null,
      accessToken: null,
      refreshToken: null,
      expiredReason: reason ?? null,
    });
    await Promise.all([
      deleteSecureItem(ACCESS_KEY),
      deleteSecureItem(REFRESH_KEY),
      deleteSecureItem(USER_KEY),
    ]);
  },

  clearExpiredReason() {
    set({ expiredReason: null });
  },
}));
