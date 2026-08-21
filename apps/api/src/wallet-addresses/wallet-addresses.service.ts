import { Inject, Injectable } from '@nestjs/common';
import type { MerchantWalletAddress } from '@cryptopay/database';
import { generateFakeAddress } from '@cryptopay/blockchain';
import { ValidationError } from '@cryptopay/shared';
import type { SetWalletAddressInput } from '@cryptopay/validation';
import { AuditService } from '../audit/audit.service.js';
import { BlockchainAdapterRegistry } from '../blockchain/blockchain-adapter-registry.service.js';
import type { RequestContext } from '../common/request-context.util.js';
import { ENV, type Env } from '../config/env.provider.js';
import { PrismaService } from '../database/prisma.service.js';

/**
 * Manages `MerchantWalletAddress` — the organization's own receiving
 * address for a (network, token), which `InvoicesService.create()` reads
 * to populate `Invoice.paymentAddress`. The platform never generates or
 * holds a key for this (spec §42); the merchant supplies the address, and
 * it's reused across every invoice on that network/token.
 */
@Injectable()
export class WalletAddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: BlockchainAdapterRegistry,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(organizationId: string): Promise<MerchantWalletAddress[]> {
    return this.prisma.merchantWalletAddress.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async set(
    organizationId: string,
    userId: string,
    input: SetWalletAddressInput,
    ctx: RequestContext,
  ): Promise<MerchantWalletAddress> {
    const adapter = this.registry.get(input.network);
    if (!adapter.validateAddress(input.address)) {
      throw new ValidationError(`"${input.address}" is not a valid ${input.network} address`);
    }

    const wallet = await this.prisma.merchantWalletAddress.upsert({
      where: { organizationId_network_token: { organizationId, network: input.network, token: input.token } },
      create: { organizationId, network: input.network, token: input.token, address: input.address },
      update: { address: input.address },
    });

    await this.audit.record({
      organizationId,
      actorId: userId,
      actorType: 'user',
      action: 'wallet_address.set',
      resourceType: 'merchant_wallet_address',
      resourceId: wallet.id,
      metadata: { network: input.network, token: input.token },
      ...ctx,
    });

    return wallet;
  }

  /**
   * Read path for `InvoicesService.create()`. In fake mode, auto-provisions
   * one address the first time an org needs it for a network/token — this
   * is what keeps Phase 1's "create org → create invoice" flow working with
   * zero manual setup, same as `FakeBlockchainAdapter.generateDepositAddress()`
   * did before it was removed. In evm mode there's no such fallback: the
   * merchant must set a real address first (spec §42 — never generate one).
   */
  async getDepositAddress(organizationId: string, network: string, token: string): Promise<string> {
    const existing = await this.prisma.merchantWalletAddress.findUnique({
      where: { organizationId_network_token: { organizationId, network, token } },
    });
    if (existing) return existing.address;

    if (this.env.BLOCKCHAIN_MODE === 'fake') {
      const address = generateFakeAddress();
      await this.prisma.merchantWalletAddress.create({
        data: { organizationId, network, token, address },
      });
      return address;
    }

    throw new ValidationError(
      `No deposit address configured for ${network}/${token}. Set one in the dashboard before creating an invoice.`,
    );
  }
}
