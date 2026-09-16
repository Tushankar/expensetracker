import type { AuthenticatedUser } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requestId`, echoed on the response and present in every log line. */
      id: string;
      /**
       * Set by `requireAuth`, derived from the signed access token and nothing else.
       * No handler may read a user id from the body, the query or a header — see
       * the note in `middleware/auth.ts`.
       */
      user?: AuthenticatedUser;
    }
  }
}

export {};
