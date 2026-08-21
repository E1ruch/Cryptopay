import { EvmBlockchainAdapter } from './evm-blockchain-adapter.js';
import { FakeBlockchainAdapter } from './fake-blockchain-adapter.js';
import type { BlockchainAdapter } from './blockchain-adapter.js';

export type BlockchainMode = 'fake' | 'evm';

export interface BlockchainAdapterRegistryConfig {
  mode: BlockchainMode;
  /** Fake-mode only — how often FakeBlockchainAdapter "mines" a block. */
  blockTimeMs: number;
  /** Evm-mode only — Base Sepolia RPC endpoint. */
  baseSepoliaRpcUrl: string;
}

/**
 * One {@link BlockchainAdapter} instance per network (spec §20: "one
 * adapter instance serves exactly one network"). Phase 2 only registers
 * `base` — adding a second network/chain later is just another entry here,
 * nothing above this layer needs to change.
 */
export function createBlockchainAdapterRegistry(
  config: BlockchainAdapterRegistryConfig,
): ReadonlyMap<string, BlockchainAdapter> {
  const base: BlockchainAdapter =
    config.mode === 'evm'
      ? new EvmBlockchainAdapter({ network: 'base', rpcUrl: config.baseSepoliaRpcUrl })
      : new FakeBlockchainAdapter({ blockTimeMs: config.blockTimeMs });

  return new Map([['base', base]]);
}
