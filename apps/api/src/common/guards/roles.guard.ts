import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { MembershipRole } from '@cryptopay/shared';
import { ForbiddenError } from '@cryptopay/shared';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/** Must run after OrganizationScopeGuard (needs request.membershipRole). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<MembershipRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.membershipRole || !required.includes(request.membershipRole)) {
      throw new ForbiddenError('Insufficient role for this action');
    }
    return true;
  }
}
