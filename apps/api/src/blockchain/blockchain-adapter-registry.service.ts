import { Inject, Injectable } from '@nestjs/common';
import type { BlockchainAdapter } from '@cryptopay/blockchain';
import { ValidationError } from '@cryptopay/shared';
import { BLOCKCHAIN_ADAPTER_REGISTRY } from './blockchain-adapter.token.js';

/**
 * Thin NestJS wrapper around `@cryptopay/blockchain`'s adapter registry
 * (spec §20: "one adapter instance serves exactly one network") — callers
 * resolve by `Invoice.network` rather than depending on a single fixed
 * adapter.
 */
@Injectable()
export class BlockchainAdapterRegistry {
  constructor(@Inject(BLOCKCHAIN_ADAPTER_REGISTRY) private readonly registry: ReadonlyMap<string, BlockchainAdapter>) {}

  get(network: string): BlockchainAdapter {
    const adapter = this.registry.get(network);
    if (!adapter) {
      throw new ValidationError(`Unsupported network: ${network}`);
    }
    return adapter;
  }
}
