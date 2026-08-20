export interface AppErrorOptions {
  httpStatus: number;
  details?: unknown;
  cause?: unknown;
}

/**
 * Base class for every error that is allowed to reach an API response.
 * Anything else (unexpected exceptions) must be caught and wrapped into an
 * InternalError by the global exception filter — never forwarded raw, since
 * that could leak stack traces or internal details (spec §55).
 */
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: string, message: string, options: AppErrorOptions) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = options.httpStatus;
    if (options.details !== undefined) {
      this.details = options.details;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super('validation_error', message, { httpStatus: 400, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required or has failed') {
    super('unauthorized', message, { httpStatus: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super('forbidden', message, { httpStatus: 403 });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('not_found', message, { httpStatus: 404 });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists or conflicts with current state') {
    super('conflict', message, { httpStatus: 409 });
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super('rate_limited', message, { httpStatus: 429 });
  }
}

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred', cause?: unknown) {
    super('internal_error', message, { httpStatus: 500, cause });
  }
}

/** Domain state-machine violations (e.g. an illegal invoice/payment transition). */
export class InvalidStateTransitionError extends AppError {
  constructor(message: string, details?: unknown) {
    super('invalid_state_transition', message, { httpStatus: 409, details });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Wraps any thrown value into an AppError. The original error is kept as
 * `cause` for server-side logging only — its message is never forwarded to
 * the client, since unexpected errors (driver exceptions, etc.) can contain
 * internal details (spec §55: never expose stack traces / internals).
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  return new InternalError('An unexpected error occurred', error);
}
