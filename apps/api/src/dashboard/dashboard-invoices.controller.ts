import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { paginationQuerySchema, type PaginationQuery } from '@cryptopay/validation';
import { CurrentOrganizationId } from '../common/decorators/current-organization-id.decorator.js';
import { OrganizationScopeGuard } from '../common/guards/organization-scope.guard.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ENV, type Env } from '../config/env.provider.js';
import { toInvoiceView, type InvoiceView } from '../invoices/invoice.presenter.js';
import { InvoicesService } from '../invoices/invoices.service.js';

export interface PaginatedInvoices {
  data: InvoiceView[];
  page: number;
  limit: number;
  total: number;
}

/**
 * Dashboard-facing reads (spec §63) — session-cookie authenticated, unlike
 * the merchant API's /v1/invoices (API-key authenticated): the browser
 * dashboard has a session, never an API key.
 */
@Controller('v1/dashboard/invoices')
@UseGuards(SessionAuthGuard, OrganizationScopeGuard)
export class DashboardInvoicesController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly invoices: InvoicesService,
  ) {}

  @Get()
  async list(
    @CurrentOrganizationId() organizationId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedInvoices> {
    const { data, total } = await this.invoices.list(organizationId, query);
    return {
      data: data.map((invoice) => toInvoiceView(invoice, this.env.CHECKOUT_BASE_URL)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  @Get(':id')
  async getById(@CurrentOrganizationId() organizationId: string, @Param('id') id: string): Promise<InvoiceView> {
    const invoice = await this.invoices.getById(organizationId, id);
    return toInvoiceView(invoice, this.env.CHECKOUT_BASE_URL);
  }
}
