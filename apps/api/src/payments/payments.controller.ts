import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { simulatePaymentSchema, type SimulatePaymentInput } from '@cryptopay/validation';
import { CurrentOrganizationId } from '../common/decorators/current-organization-id.decorator.js';
import { RequireScopes } from '../common/decorators/require-scopes.decorator.js';
import { ApiKeyAuthGuard } from '../common/guards/api-key-auth.guard.js';
import { ScopesGuard } from '../common/guards/scopes.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ENV, type Env } from '../config/env.provider.js';
import { toInvoiceView, type InvoiceView } from '../invoices/invoice.presenter.js';
import { PaymentsService } from './payments.service.js';

@Controller('v1/invoices')
@UseGuards(ApiKeyAuthGuard, ScopesGuard)
export class PaymentsController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly payments: PaymentsService,
  ) {}

  @Post(':id/simulate-payment')
  @RequireScopes('invoices:write')
  async simulatePayment(
    @CurrentOrganizationId() organizationId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(simulatePaymentSchema)) body: SimulatePaymentInput,
  ): Promise<InvoiceView> {
    const invoice = await this.payments.simulatePayment(organizationId, id, body);
    return toInvoiceView(invoice, this.env.CHECKOUT_BASE_URL);
  }
}
