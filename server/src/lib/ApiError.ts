/**
 * Machine-readable failure codes. The mobile client branches on these, never on
 * the human-readable message, so a copy change can never break a client.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeName = (typeof ErrorCode)[keyof typeof ErrorCode];

export type FieldIssue = { field: string; message: string };

/**
 * Every failure the API produces on purpose. Anything thrown that is *not* an
 * ApiError is a bug, and the error handler treats it as one: 500, no detail
 * leaked, logged at error level.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCodeName;
  readonly issues?: FieldIssue[];
  /** Extra machine-readable context, e.g. the id that was not found. */
  readonly meta?: Record<string, unknown>;

  constructor(
    status: number,
    code: ErrorCodeName,
    message: string,
    options: { issues?: FieldIssue[]; meta?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = options.issues;
    this.meta = options.meta;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string, issues?: FieldIssue[]) {
    return new ApiError(400, ErrorCode.VALIDATION_ERROR, message, { issues });
  }

  static unauthorized(message = 'Sign in to continue') {
    return new ApiError(401, ErrorCode.UNAUTHORIZED, message);
  }

  /** 401 with a code the client uses as its cue to refresh and retry once. */
  static tokenExpired(message = 'Access token expired') {
    return new ApiError(401, ErrorCode.TOKEN_EXPIRED, message);
  }

  static forbidden(message = 'You do not have access to this') {
    return new ApiError(403, ErrorCode.FORBIDDEN, message);
  }

  static notFound(message = 'Not found', meta?: Record<string, unknown>) {
    return new ApiError(404, ErrorCode.NOT_FOUND, message, { meta });
  }

  static conflict(message: string, meta?: Record<string, unknown>) {
    return new ApiError(409, ErrorCode.CONFLICT, message, { meta });
  }

  static internal(message = 'Something went wrong', cause?: unknown) {
    return new ApiError(500, ErrorCode.INTERNAL, message, { cause });
  }
}
