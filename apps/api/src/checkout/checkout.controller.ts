import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { simulatePaymentSchema, type SimulatePaymentInput } from '@cryptopay/validation';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { RedisRateLimitGuard } from '../common/guards/redis-rate-limit.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PaymentsService } from '../payments/payments.service.js';
import { toCheckoutView, type CheckoutView } from './checkout.presenter.js';
import { CheckoutService } from './checkout.service.js';

/**
 * Public, unauthenticated by design (spec §19: the checkout page a customer
 * opens has no API key) — access is gated by the invoice's own opaque id
 * plus a generous per-IP rate limit (spec §30: 100/minute/IP) rather than
 * ApiKeyAuthGuard/ScopesGuard.
 */
@Controller('v1/checkout')
@UseGuards(RedisRateLimitGuard)
@RateLimit('checkout')
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly payments: PaymentsService,
  ) {}

  @Get(':id')
  async get(@Param('id') id: string): Promise<CheckoutView> {
    const invoice = await this.checkout.getForCheckout(id);
    return toCheckoutView(invoice, invoice.organization.name);
  }

  @Post(':id/simulate-payment')
  async simulatePayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(simulatePaymentSchema)) body: SimulatePaymentInput,
  ): Promise<CheckoutView> {
    const invoice = await this.payments.simulatePaymentForCheckout(id, body);
    const withMerchant = await this.checkout.getForCheckout(invoice.id);
    return toCheckoutView(withMerchant, withMerchant.organization.name);
  }
}
