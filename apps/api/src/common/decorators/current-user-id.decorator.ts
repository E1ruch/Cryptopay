import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@cryptopay/shared';

/** Only valid on routes guarded by SessionAuthGuard, which populates userId. */
export const CurrentUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!request.userId) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.userId;
});
