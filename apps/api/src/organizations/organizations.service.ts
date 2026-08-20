import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConflictError, ForbiddenError } from '@cryptopay/shared';
import type { CreateOrganizationInput, InviteMemberInput, UpdateOrganizationInput } from '@cryptopay/validation';
import { Prisma, type Membership, type Organization } from '@cryptopay/database';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../common/request-context.util.js';

// Exported so the `typeof` reference below counts as a use — this value only
// exists to let Prisma derive MembershipWithUser's exact shape.
export const membershipWithUser = Prisma.validator<Prisma.MembershipDefaultArgs>()({
  include: { user: { select: { id: true, email: true } } },
});
export type MembershipWithUser = Prisma.MembershipGetPayload<typeof membershipWithUser>;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'org'
  );
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    userId: string,
    input: CreateOrganizationInput,
    ctx: RequestContext,
  ): Promise<Organization> {
    const baseSlug = slugify(input.name);
    let slug = baseSlug;
    let suffix = 0;
    // Small bounded retry loop for slug collisions — organizations are created
    // rarely enough that this never needs to scale beyond a handful of tries.
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${randomBytes(3).toString('hex')}`;
      if (suffix > 5) {
        throw new ConflictError('Could not generate a unique organization slug, try a different name');
      }
    }

    const organization = await this.prisma.organization.create({
      data: {
        name: input.name,
        slug,
        memberships: { create: { userId, role: 'OWNER' } },
      },
    });

    await this.audit.record({
      organizationId: organization.id,
      actorId: userId,
      actorType: 'user',
      action: 'organization.create',
      resourceType: 'organization',
      resourceId: organization.id,
      ...ctx,
    });

    return organization;
  }

  async getById(organizationId: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id: organizationId } });
  }

  async update(
    organizationId: string,
    input: UpdateOrganizationInput,
    actorId: string,
    ctx: RequestContext,
  ): Promise<Organization> {
    if (input.slug) {
      const existing = await this.prisma.organization.findUnique({ where: { slug: input.slug } });
      if (existing && existing.id !== organizationId) {
        throw new ConflictError('This slug is already taken');
      }
    }

    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
      },
    });

    await this.audit.record({
      organizationId,
      actorId,
      actorType: 'user',
      action: 'organization.update',
      resourceType: 'organization',
      resourceId: organizationId,
      ...ctx,
    });

    return organization;
  }

  async listMembers(organizationId: string): Promise<MembershipWithUser[]> {
    return this.prisma.membership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async inviteMember(
    organizationId: string,
    input: InviteMemberInput,
    actorId: string,
    ctx: RequestContext,
  ): Promise<Membership> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new ForbiddenError('No CryptoPay account exists for this email yet');
    }

    const membership = await this.prisma.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId } },
      create: { userId: user.id, organizationId, role: input.role },
      update: { role: input.role },
    });

    await this.audit.record({
      organizationId,
      actorId,
      actorType: 'user',
      action: 'membership.invite',
      resourceType: 'membership',
      resourceId: membership.id,
      metadata: { invitedEmail: input.email, role: input.role },
      ...ctx,
    });

    return membership;
  }
}
