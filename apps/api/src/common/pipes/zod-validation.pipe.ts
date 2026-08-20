import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { toValidationError } from '@cryptopay/validation';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw toValidationError(result.error);
    }
    return result.data;
  }
}
