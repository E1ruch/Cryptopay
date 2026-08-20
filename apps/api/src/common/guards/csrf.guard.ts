import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '@cryptopay/shared';
import { safeEqualHex } from '@cryptopay/crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Double-submit cookie CSRF check for cookie-authenticated dashboard routes. */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

    const cookieToken = request.cookies?.cp_csrf;
    const headerToken = request.headers['x-csrf-token'];

    if (
      !cookieToken ||
      typeof headerToken !== 'string' ||
      !safeEqualHex(cookieToken, headerToken)
    ) {
      throw new ForbiddenError('Invalid or missing CSRF token');
    }
    return true;
  }
}
