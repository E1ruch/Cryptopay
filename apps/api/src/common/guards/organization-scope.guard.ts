import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '@cryptopay/shared';
import { PrismaService } from '../../database/prisma.service.js';

/**
 * Resolves and verifies the caller's organization for this request — the
 * central BOLA defense (spec §12): a userId alone never implies access to a
 * given organization's resources, membership must be checked every time.
 */
@Injectable()
export class OrganizationScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const headerOrgId = request.headers['x-organization-id'];
    const requestedOrgId = typeof headerOrgId === 'string' ? headerOrgId : undefined;

    const memberships = await this.prisma.membership.findMany({
      where: { userId: request.userId },
      select: { organizationId: true, role: true },
    });

    if (memberships.length === 0) {
      throw new ForbiddenError('You do not belong to any organization yet');
    }

    let targetOrgId = requestedOrgId;
    if (!targetOrgId && memberships.length === 1) {
      const only = memberships[0];
      if (only) targetOrgId = only.organizationId;
    }

    if (!targetOrgId) {
      throw new ForbiddenError(
        'You belong to multiple organizations — specify X-Organization-Id',
      );
    }

    const membership = memberships.find((m) => m.organizationId === targetOrgId);
    if (!membership) {
      throw new ForbiddenError('You do not have access to this organization');
    }

    request.organizationId = membership.organizationId;
    request.membershipRole = membership.role;
    return true;
  }
}
