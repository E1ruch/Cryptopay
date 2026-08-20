import { Module } from '@nestjs/common';
import { FakeBlockchainAdapter } from '@cryptopay/blockchain';
import { ENV, type Env } from '../config/env.provider.js';
import { BLOCKCHAIN_ADAPTER } from './blockchain-adapter.token.js';

/**
 * Phase 1 wires a single {@link FakeBlockchainAdapter} behind
 * BLOCKCHAIN_ADAPTER for every network (spec §93: "fake blockchain"). Phase
 * 2 replaces this with a registry keyed by Invoice.network, resolving to a
 * real per-chain adapter — callers only ever depend on the BlockchainAdapter
 * interface (spec §20), so that swap won't touch invoices.service.ts or
 * payments.service.ts.
 */
@Module({
  providers: [
    {
      provide: BLOCKCHAIN_ADAPTER,
      inject: [ENV],
      useFactory: (env: Env) => new FakeBlockchainAdapter({ blockTimeMs: env.BLOCKCHAIN_BLOCK_TIME_MS }),
    },
  ],
  exports: [BLOCKCHAIN_ADAPTER],
})
export class BlockchainModule {}
