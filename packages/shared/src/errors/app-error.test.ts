import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  NotFoundError,
  InternalError,
  isAppError,
  toAppError,
} from './app-error.js';
import { toApiErrorResponse } from './api-error-response.js';

describe('AppError hierarchy', () => {
  it('assigns the correct code and httpStatus per subclass', () => {
    expect(new ValidationError().code).toBe('validation_error');
    expect(new ValidationError().httpStatus).toBe(400);
    expect(new NotFoundError().httpStatus).toBe(404);
  });

  it('is recognized by isAppError', () => {
    expect(isAppError(new ValidationError())).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError('not an error')).toBe(false);
  });

  it('carries optional details', () => {
    const err = new ValidationError('bad input', { field: 'email' });
    expect(err.details).toEqual({ field: 'email' });
  });

  it('omits details when not provided', () => {
    const err = new NotFoundError();
    expect(err.details).toBeUndefined();
  });
});

describe('toAppError', () => {
  it('passes through an existing AppError unchanged', () => {
    const original = new NotFoundError('missing invoice');
    expect(toAppError(original)).toBe(original);
  });

  it('wraps unknown errors as InternalError without leaking the original message', () => {
    const wrapped = toAppError(new Error('leaked db connection string: postgres://secret'));
    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.message).not.toContain('secret');
    expect(wrapped.httpStatus).toBe(500);
  });

  it('wraps non-Error thrown values too', () => {
    const wrapped = toAppError('some string throw');
    expect(wrapped).toBeInstanceOf(InternalError);
  });
});

describe('toApiErrorResponse', () => {
  it('produces the standard wire format', () => {
    const err = new ValidationError('Invalid amount', { field: 'amount' });
    const response = toApiErrorResponse(err, 'req_123');
    expect(response).toEqual({
      error: {
        code: 'validation_error',
        message: 'Invalid amount',
        request_id: 'req_123',
        details: { field: 'amount' },
      },
    });
  });

  it('omits the details key entirely when there are none', () => {
    const err = new NotFoundError('Invoice not found');
    const response = toApiErrorResponse(err, 'req_456');
    expect('details' in response.error).toBe(false);
  });
});
