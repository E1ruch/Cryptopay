import { Module } from '@nestjs/common';
import { createBlockchainAdapterRegistry } from '@cryptopay/blockchain';
import { ENV, type Env } from '../config/env.provider.js';
import { BlockchainAdapterRegistry } from './blockchain-adapter-registry.service.js';
import { BLOCKCHAIN_ADAPTER_REGISTRY } from './blockchain-adapter.token.js';

/**
 * `BLOCKCHAIN_MODE=fake` (default) keeps every network on
 * `FakeBlockchainAdapter` — Phase 0/1's flow, zero external calls.
 * `BLOCKCHAIN_MODE=evm` swaps `base` to a real Base Sepolia RPC adapter
 * (spec §93 Phase 2). Either way, callers only ever depend on
 * {@link BlockchainAdapterRegistry}, never on which mode is active.
 */
@Module({
  providers: [
    {
      provide: BLOCKCHAIN_ADAPTER_REGISTRY,
      inject: [ENV],
      useFactory: (env: Env) =>
        createBlockchainAdapterRegistry({
          mode: env.BLOCKCHAIN_MODE,
          blockTimeMs: env.BLOCKCHAIN_BLOCK_TIME_MS,
          baseSepoliaRpcUrl: env.BASE_SEPOLIA_RPC_URL,
        }),
    },
    BlockchainAdapterRegistry,
  ],
  exports: [BlockchainAdapterRegistry],
})
export class BlockchainModule {}
