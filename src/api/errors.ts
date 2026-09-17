/** Field-level detail from a 400. Used to put a message under the right input. */
export type FieldIssue = { field: string; message: string };

/**
 * A response the server produced on purpose: it reached us, it parsed, and it
 * said no. `code` is what the app branches on — the message is for the user and
 * is free to change.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: FieldIssue[];

  constructor(status: number, code: string, message: string, issues: FieldIssue[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }

  /** The message to put under a specific form field, if the server named one. */
  issueFor(field: string): string | undefined {
    return this.issues.find((issue) => issue.field === field)?.message;
  }
}

/**
 * The request never got an answer — no signal, aeroplane mode, the dev server not
 * running, DNS failing, a timeout.
 *
 * Kept distinct from `ApiError` because the two need opposite treatment: a
 * validation error is the user's to fix and a network error is not, and offering
 * "Try again" for a 409 is as wrong as offering "Check the form" for lost signal.
 */
export class NetworkError extends Error {
  readonly cause?: unknown;

  constructor(message = 'No internet connection', cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** True when the session is gone for good and the app must return to sign-in. */
export function isAuthError(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

/**
 * One line to show the user, whatever went wrong. Every error state in the app
 * goes through here so an unexpected failure can never render as "[object Object]"
 * or a stack trace.
 */
export function errorMessage(error: unknown): string {
  // Both of these carry a message written to be read: the server's, or ours.
  if (isNetworkError(error)) return error.message;
  if (isApiError(error)) return error.message;

  /**
   * Anything else is a fault, not a message.
   *
   * Nothing in the app throws a bare `Error` on purpose — every deliberate
   * failure is an `ApiError` or a `NetworkError` — so whatever lands here is a
   * runtime bug, and its text reads like one. A failed export used to put
   * "this.validatePath is not a function" in a toast under "Could not export",
   * which tells the user nothing and tells everyone else too much.
   *
   * The detail still surfaces in a development build, where someone is there to
   * read it. `process.env.NODE_ENV` rather than `__DEV__`: Metro inlines both,
   * but this module is also imported by the Node test scripts, where `__DEV__`
   * does not exist.
   */
  if (process.env.NODE_ENV !== 'production' && error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong';
}
