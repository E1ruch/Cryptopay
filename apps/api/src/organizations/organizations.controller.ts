import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  inviteMemberSchema,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  type InviteMemberInput,
} from '@cryptopay/validation';
import { NotFoundError } from '@cryptopay/shared';
import type { Membership, Organization } from '@cryptopay/database';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { OrganizationScopeGuard } from '../common/guards/organization-scope.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CsrfGuard } from '../common/guards/csrf.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator.js';
import { CurrentOrganizationId } from '../common/decorators/current-organization-id.decorator.js';
import { extractRequestContext } from '../common/request-context.util.js';
import { OrganizationsService, type MembershipWithUser } from './organizations.service.js';

@Controller('v1/organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @UseGuards(SessionAuthGuard, CsrfGuard)
  async create(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(createOrganizationSchema)) body: CreateOrganizationInput,
    @Req() request: FastifyRequest,
  ): Promise<Organization> {
    return this.organizations.create(userId, body, extractRequestContext(request));
  }

  @Get('me')
  @UseGuards(SessionAuthGuard, OrganizationScopeGuard)
  async getMine(@CurrentOrganizationId() organizationId: string): Promise<Organization> {
    const organization = await this.organizations.getById(organizationId);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }
    return organization;
  }

  @Patch('me')
  @UseGuards(SessionAuthGuard, OrganizationScopeGuard, RolesGuard, CsrfGuard)
  @Roles('OWNER', 'ADMIN')
  async updateMine(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: UpdateOrganizationInput,
    @Req() request: FastifyRequest,
  ): Promise<Organization> {
    return this.organizations.update(organizationId, body, userId, extractRequestContext(request));
  }

  @Get('me/members')
  @UseGuards(SessionAuthGuard, OrganizationScopeGuard)
  async listMembers(@CurrentOrganizationId() organizationId: string): Promise<MembershipWithUser[]> {
    return this.organizations.listMembers(organizationId);
  }

  @Post('me/members')
  @UseGuards(SessionAuthGuard, OrganizationScopeGuard, RolesGuard, CsrfGuard)
  @Roles('OWNER', 'ADMIN')
  async inviteMember(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMemberInput,
    @Req() request: FastifyRequest,
  ): Promise<Membership> {
    return this.organizations.inviteMember(organizationId, body, userId, extractRequestContext(request));
  }
}
