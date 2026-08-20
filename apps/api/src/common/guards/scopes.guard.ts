import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { ApiKeyScope } from '@cryptopay/shared';
import { ForbiddenError } from '@cryptopay/shared';
import { SCOPES_KEY } from '../decorators/require-scopes.decorator.js';

/**
 * Enforces `@RequireScopes(...)` against the scopes an API key was granted
 * at creation time (spec §75). Must run after ApiKeyAuthGuard, which
 * populates `request.apiKeyScopes`.
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ApiKeyScope[] | undefined>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const granted = request.apiKeyScopes ?? [];
    const hasAllScopes = required.every((scope) => granted.includes(scope));
    if (!hasAllScopes) {
      throw new ForbiddenError('API key is missing a required scope');
    }
    return true;
  }
}
