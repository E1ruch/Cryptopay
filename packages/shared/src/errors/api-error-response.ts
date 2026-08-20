import type { AppError } from './app-error.js';

/** Wire format for every API error response (spec §55). */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    request_id: string;
    details?: unknown;
  };
}

export function toApiErrorResponse(error: AppError, requestId: string): ApiErrorResponse {
  const body: ApiErrorResponse['error'] = {
    code: error.code,
    message: error.message,
    request_id: requestId,
  };
  if (error.details !== undefined) {
    body.details = error.details;
  }
  return { error: body };
}
