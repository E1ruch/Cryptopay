import { ValidationError } from '@cryptopay/shared';

/**
 * Canonical token identity is `chain_id` + `contract_address` + `decimals`
 * (spec §23) — never the symbol alone, since symbols can be spoofed by an
 * unrelated contract. This is the one place that mapping lives; the EVM
 * adapter uses it to know which contract's `Transfer` logs to watch and how
 * to convert a raw `uint256` into a `Prisma.Decimal` amount.
 */
export interface TokenConfig {
  contractAddress: `0x${string}`;
  decimals: number;
}

// Base Sepolia testnet only (Phase 2 scope — spec §93 "Use testnet").
// Source: Circle's official testnet USDC contract list.
const TOKEN_REGISTRY: Record<string, Record<string, TokenConfig>> = {
  base: {
    USDC: {
      contractAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      decimals: 6,
    },
  },
};

export function getTokenConfig(network: string, token: string): TokenConfig {
  const config = TOKEN_REGISTRY[network]?.[token];
  if (!config) {
    throw new ValidationError(`No token contract configured for ${token} on ${network}`);
  }
  return config;
}

/** Every token this adapter should watch for on `network` — used by the scanner to build one `getLogs` call per token per tick. */
export function getTokensForNetwork(network: string): Record<string, TokenConfig> {
  return TOKEN_REGISTRY[network] ?? {};
}
