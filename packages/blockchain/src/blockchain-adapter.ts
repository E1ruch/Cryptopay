import type { Prisma } from '@cryptopay/database';

export type TransactionStatus = 'pending' | 'success' | 'failed';

export interface BlockchainTransaction {
  txHash: string;
  blockNumber: number;
  status: TransactionStatus;
}

export interface TokenTransfer {
  txHash: string;
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
 * `generateDepositAddress` is not in the spec's illustrative §20 snippet,
 * but every implementation needs it: an Invoice requires a `payment_address`
 * at creation time (spec §16), and how an address is derived is exactly the
 * kind of chain-specific detail this interface exists to hide.
 */
export interface BlockchainAdapter {
  generateDepositAddress(): string;
  validateAddress(address: string): boolean;
  getLatestBlock(): Promise<number>;
  getTransaction(txHash: string): Promise<BlockchainTransaction | null>;
  getTokenTransfers(blockNumber: number): Promise<TokenTransfer[]>;
  getConfirmations(txHash: string): Promise<number>;
}
