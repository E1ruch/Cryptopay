import type { ZodError } from 'zod';
import { ValidationError } from '@cryptopay/shared';

export interface FieldIssue {
  path: string;
  message: string;
}

export function formatZodIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function toValidationError(error: ZodError): ValidationError {
  return new ValidationError('Request validation failed', formatZodIssues(error));
}
