import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { MerchantWalletAddress } from '@cryptopay/database';
import { setWalletAddressSchema, type SetWalletAddressInput } from '@cryptopay/validation';
import { CurrentOrganizationId } from '../common/decorators/current-organization-id.decorator.js';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CsrfGuard } from '../common/guards/csrf.guard.js';
import { OrganizationScopeGuard } from '../common/guards/organization-scope.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { extractRequestContext } from '../common/request-context.util.js';
import { WalletAddressesService } from './wallet-addresses.service.js';

/**
 * Dashboard-facing merchant deposit address management (spec §42) —
 * session-cookie authenticated, mirroring DashboardWebhooksController's
 * guard stack (mutation needs OWNER/ADMIN + CSRF; reads only need org
 * membership).
 */
@Controller('v1/dashboard/wallet-addresses')
@UseGuards(SessionAuthGuard, OrganizationScopeGuard)
export class WalletAddressesController {
  constructor(private readonly walletAddresses: WalletAddressesService) {}

  @Get()
  async list(@CurrentOrganizationId() organizationId: string): Promise<MerchantWalletAddress[]> {
    return this.walletAddresses.list(organizationId);
  }

  @Put()
  @UseGuards(RolesGuard, CsrfGuard)
  @Roles('OWNER', 'ADMIN')
  async set(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(setWalletAddressSchema)) body: SetWalletAddressInput,
    @Req() request: FastifyRequest,
  ): Promise<MerchantWalletAddress> {
    return this.walletAddresses.set(organizationId, userId, body, extractRequestContext(request));
  }
}
