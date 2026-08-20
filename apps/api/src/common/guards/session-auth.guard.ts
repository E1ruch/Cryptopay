import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@cryptopay/shared';
import { AccessTokenService } from '../../auth/tokens/access-token.service.js';

/** Validates the `cp_at` session cookie and populates request.userId. */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly accessTokens: AccessTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = request.cookies?.cp_at;

    if (!token) {
      throw new UnauthorizedError('Authentication required');
    }

    try {
      const payload = await this.accessTokens.verify(token);
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedError('Invalid or expired session');
    }
  }
}
