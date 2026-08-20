import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createWebhookEndpointSchema, type CreateWebhookEndpointInput } from '@cryptopay/validation';
import { CurrentApiKeyId } from '../common/decorators/current-api-key-id.decorator.js';
import { CurrentOrganizationId } from '../common/decorators/current-organization-id.decorator.js';
import { RequireScopes } from '../common/decorators/require-scopes.decorator.js';
import { ApiKeyAuthGuard } from '../common/guards/api-key-auth.guard.js';
import { ScopesGuard } from '../common/guards/scopes.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { extractRequestContext } from '../common/request-context.util.js';
import { toWebhookEndpointView, type WebhookEndpointView } from './webhook-endpoint.presenter.js';
import { WebhookEndpointsService } from './webhook-endpoints.service.js';

@Controller('v1/webhook-endpoints')
@UseGuards(ApiKeyAuthGuard, ScopesGuard)
export class WebhookEndpointsController {
  constructor(private readonly webhookEndpoints: WebhookEndpointsService) {}

  @Post()
  @RequireScopes('webhooks:write')
  async create(
    @CurrentOrganizationId() organizationId: string,
    @CurrentApiKeyId() apiKeyId: string,
    @Body(new ZodValidationPipe(createWebhookEndpointSchema)) body: CreateWebhookEndpointInput,
    @Req() request: FastifyRequest,
  ): Promise<WebhookEndpointView & { secret: string }> {
    const { endpoint, secret } = await this.webhookEndpoints.create(
      organizationId,
      { id: apiKeyId, type: 'api_key' },
      body,
      extractRequestContext(request),
    );
    return { ...toWebhookEndpointView(endpoint), secret };
  }

  @Get()
  @RequireScopes('webhooks:read')
  async list(@CurrentOrganizationId() organizationId: string): Promise<WebhookEndpointView[]> {
    const endpoints = await this.webhookEndpoints.list(organizationId);
    return endpoints.map(toWebhookEndpointView);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireScopes('webhooks:write')
  async revoke(
    @CurrentOrganizationId() organizationId: string,
    @CurrentApiKeyId() apiKeyId: string,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.webhookEndpoints.revoke(
      organizationId,
      id,
      { id: apiKeyId, type: 'api_key' },
      extractRequestContext(request),
    );
  }
}
