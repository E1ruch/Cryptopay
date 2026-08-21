import type { Prisma } from '@cryptopay/database';

export type TransactionStatus = 'pending' | 'success' | 'failed';

export interface BlockchainTransaction {
  txHash: string;
  blockNumber: number;
  status: TransactionStatus;
}

export interface TokenTransfer {
  txHash: string;
  network: string;
  token: string;
  fromAddress: string;
  toAddress: string;
  amount: Prisma.Decimal;
  blockNumber: number;
}

/**
 * Isolates Payment Core from how any given chain actually works (spec §20)
 * — it must never know whether it's talking to Base, Ethereum, or a fake.
 * One adapter instance serves exactly one network; a registry keyed by
 * Invoice.network picks which instance to call (spec: "Payment Core must
 * not know how Ethereum, Base, Polygon or Solana internally work").
 *
 * Deposit addresses are **not** part of this interface (Phase 1 had a
 * `generateDepositAddress()` here — removed in Phase 2). Spec §42 forbids
 * the platform from generating/holding a key for a deposit address; the
 * merchant supplies their own address instead (see
 * `MerchantWalletAddress` / `WalletAddressService`), which is an
 * organization-level concern, not something a chain adapter should know
 * about.
 */
export interface BlockchainAdapter {
  validateAddress(address: string): boolean;
  getLatestBlock(): Promise<number>;
  getTransaction(txHash: string): Promise<BlockchainTransaction | null>;
  /** Ranged scan (inclusive) — one call per tick, not one per block (spec §21 "Block Scanner"). */
  getTokenTransfers(fromBlock: number, toBlock: number): Promise<TokenTransfer[]>;
  getConfirmations(txHash: string): Promise<number>;
}
