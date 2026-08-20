import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '@cryptopay/shared';

/** Only valid on routes guarded by ApiKeyAuthGuard. */
export const CurrentApiKeyId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!request.apiKeyId) {
    throw new ForbiddenError('No API key context for this request');
  }
  return request.apiKeyId;
});
