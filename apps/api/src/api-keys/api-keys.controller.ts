import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createApiKeySchema, type CreateApiKeyInput } from '@cryptopay/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { OrganizationScopeGuard } from '../common/guards/organization-scope.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CsrfGuard } from '../common/guards/csrf.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator.js';
import { CurrentOrganizationId } from '../common/decorators/current-organization-id.decorator.js';
import { extractRequestContext } from '../common/request-context.util.js';
import { ApiKeysService } from './api-keys.service.js';
import { toApiKeyView, type ApiKeyView } from './api-key.presenter.js';

@Controller('v1/api-keys')
@UseGuards(SessionAuthGuard, OrganizationScopeGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  @UseGuards(RolesGuard, CsrfGuard)
  @Roles('OWNER', 'ADMIN')
  async create(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyInput,
    @Req() request: FastifyRequest,
  ): Promise<ApiKeyView & { rawKey: string }> {
    const { apiKey, rawKey } = await this.apiKeys.create(
      organizationId,
      body,
      userId,
      extractRequestContext(request),
    );
    return { ...toApiKeyView(apiKey), rawKey };
  }

  @Get()
  async list(@CurrentOrganizationId() organizationId: string): Promise<ApiKeyView[]> {
    const keys = await this.apiKeys.list(organizationId);
    return keys.map(toApiKeyView);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RolesGuard, CsrfGuard)
  @Roles('OWNER', 'ADMIN')
  async revoke(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUserId() userId: string,
    @Param('id') apiKeyId: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.apiKeys.revoke(organizationId, apiKeyId, userId, extractRequestContext(request));
  }
}
