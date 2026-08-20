import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createInvoiceSchema, type CreateInvoiceInput } from '@cryptopay/validation';
import { CurrentApiKeyId } from '../common/decorators/current-api-key-id.decorator.js';
import { CurrentOrganizationId } from '../common/decorators/current-organization-id.decorator.js';
import { RequireScopes } from '../common/decorators/require-scopes.decorator.js';
import { ApiKeyAuthGuard } from '../common/guards/api-key-auth.guard.js';
import { ScopesGuard } from '../common/guards/scopes.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { extractRequestContext } from '../common/request-context.util.js';
import { ENV, type Env } from '../config/env.provider.js';
import { toInvoiceView, type InvoiceView } from './invoice.presenter.js';
import { InvoicesService } from './invoices.service.js';

@Controller('v1/invoices')
@UseGuards(ApiKeyAuthGuard, ScopesGuard)
export class InvoicesController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly invoices: InvoicesService,
  ) {}

  @Post()
  @RequireScopes('invoices:write')
  async create(
    @CurrentOrganizationId() organizationId: string,
    @CurrentApiKeyId() apiKeyId: string,
    @Body(new ZodValidationPipe(createInvoiceSchema)) body: CreateInvoiceInput,
    @Req() request: FastifyRequest,
  ): Promise<InvoiceView> {
    const invoice = await this.invoices.create(
      organizationId,
      apiKeyId,
      body,
      extractRequestContext(request),
    );
    return toInvoiceView(invoice, this.env.CHECKOUT_BASE_URL);
  }

  @Get(':id')
  @RequireScopes('invoices:read')
  async getById(
    @CurrentOrganizationId() organizationId: string,
    @Param('id') id: string,
  ): Promise<InvoiceView> {
    const invoice = await this.invoices.getById(organizationId, id);
    return toInvoiceView(invoice, this.env.CHECKOUT_BASE_URL);
  }
}
