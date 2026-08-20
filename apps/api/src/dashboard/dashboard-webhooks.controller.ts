import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createWebhookEndpointSchema, type CreateWebhookEndpointInput } from '@cryptopay/validation';
import { CurrentOrganizationId } from '../common/decorators/current-organization-id.decorator.js';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CsrfGuard } from '../common/guards/csrf.guard.js';
import { OrganizationScopeGuard } from '../common/guards/organization-scope.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { extractRequestContext } from '../common/request-context.util.js';
import { toWebhookDeliveryView, type WebhookDeliveryView } from './webhook-delivery.presenter.js';
import { toWebhookEndpointView, type WebhookEndpointView } from '../webhooks/webhook-endpoint.presenter.js';
import { WebhookEndpointsService } from '../webhooks/webhook-endpoints.service.js';

/**
 * Dashboard-facing webhook endpoint management (spec §63) — session-cookie
 * authenticated, mirroring ApiKeysController's guard stack (mutations need
 * OWNER/ADMIN + CSRF; reads only need org membership).
 */
@Controller('v1/dashboard/webhook-endpoints')
@UseGuards(SessionAuthGuard, OrganizationScopeGuard)
export class DashboardWebhooksController {
  constructor(private readonly webhookEndpoints: WebhookEndpointsService) {}

  @Post()
  @UseGuards(RolesGuard, CsrfGuard)
  @Roles('OWNER', 'ADMIN')
  async create(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(createWebhookEndpointSchema)) body: CreateWebhookEndpointInput,
    @Req() request: FastifyRequest,
  ): Promise<WebhookEndpointView & { secret: string }> {
    const { endpoint, secret } = await this.webhookEndpoints.create(
      organizationId,
      { id: userId, type: 'user' },
      body,
      extractRequestContext(request),
    );
    return { ...toWebhookEndpointView(endpoint), secret };
  }

  @Get()
  async list(@CurrentOrganizationId() organizationId: string): Promise<WebhookEndpointView[]> {
    const endpoints = await this.webhookEndpoints.list(organizationId);
    return endpoints.map(toWebhookEndpointView);
  }

  @Get(':id/deliveries')
  async listDeliveries(
    @CurrentOrganizationId() organizationId: string,
    @Param('id') id: string,
  ): Promise<WebhookDeliveryView[]> {
    const deliveries = await this.webhookEndpoints.listDeliveries(organizationId, id);
    return deliveries.map(toWebhookDeliveryView);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RolesGuard, CsrfGuard)
  @Roles('OWNER', 'ADMIN')
  async revoke(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.webhookEndpoints.revoke(
      organizationId,
      id,
      { id: userId, type: 'user' },
      extractRequestContext(request),
    );
  }
}
