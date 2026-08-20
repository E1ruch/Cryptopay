import { randomBytes } from 'node:crypto';
import type { Prisma } from '@cryptopay/database';
import { NotFoundError } from '@cryptopay/shared';
import type { BlockchainAdapter, BlockchainTransaction, TokenTransfer } from './blockchain-adapter.js';

export interface SimulatePaymentInput {
  token: string;
  toAddress: string;
  amount: Prisma.Decimal;
  fromAddress?: string;
}

export interface FakeBlockchainAdapterOptions {
  /** Simulated block production interval in ms; confirmations accrue as this much time passes. */
  blockTimeMs?: number;
  /** Injectable clock, so tests can control confirmation growth without real delays. */
  now?: () => number;
}

/**
 * In-memory {@link BlockchainAdapter} for Phase 1 (spec §93: "fake
 * blockchain... no real money. Goal: complete payment flow without
 * blockchain."). Confirmations accrue on wall-clock time rather than a
 * manual "mine block" call, so a confirmation worker can poll this exactly
 * like it would poll a real RPC (spec §21) — Payment Core never has to know
 * it isn't real (spec §20).
 */
export class FakeBlockchainAdapter implements BlockchainAdapter {
  private readonly blockTimeMs: number;
  private readonly now: () => number;
  private readonly genesisTimestamp: number;
  private readonly transfersByTxHash = new Map<string, TokenTransfer>();
  private readonly transfersByBlock = new Map<number, TokenTransfer[]>();

  constructor(options: FakeBlockchainAdapterOptions = {}) {
    this.blockTimeMs = options.blockTimeMs ?? 2000;
    this.now = options.now ?? Date.now;
    this.genesisTimestamp = this.now();
  }

  generateDepositAddress(): string {
    return `0x${randomBytes(20).toString('hex')}`;
  }

  validateAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }

  // No method below has a real `await` — an in-memory fake never actually
  // suspends — but the interface returns Promises so it swaps in for a real
  // (genuinely async) adapter without callers caring (spec §20).

  getLatestBlock(): Promise<number> {
    return Promise.resolve(this.currentBlock());
  }

  getTransaction(txHash: string): Promise<BlockchainTransaction | null> {
    const transfer = this.transfersByTxHash.get(txHash);
    if (!transfer) return Promise.resolve(null);
    return Promise.resolve({
      txHash: transfer.txHash,
      blockNumber: transfer.blockNumber,
      status: 'success',
    });
  }

  getTokenTransfers(blockNumber: number): Promise<TokenTransfer[]> {
    return Promise.resolve(this.transfersByBlock.get(blockNumber) ?? []);
  }

  getConfirmations(txHash: string): Promise<number> {
    const transfer = this.transfersByTxHash.get(txHash);
    if (!transfer) {
      return Promise.reject(new NotFoundError(`No fake transaction found for tx hash ${txHash}`));
    }
    return Promise.resolve(Math.max(0, this.currentBlock() - transfer.blockNumber));
  }

  /**
   * Dev/test-only hook standing in for "a customer paid". Deliberately not
   * part of {@link BlockchainAdapter}: a real adapter only ever observes
   * chain state, it never creates it.
   */
  simulatePayment(input: SimulatePaymentInput): TokenTransfer {
    const transfer: TokenTransfer = {
      txHash: `0xfake${randomBytes(28).toString('hex')}`,
      token: input.token,
      fromAddress: input.fromAddress ?? this.generateDepositAddress(),
      toAddress: input.toAddress,
      amount: input.amount,
      blockNumber: this.currentBlock(),
    };
    this.transfersByTxHash.set(transfer.txHash, transfer);
    const atBlock = this.transfersByBlock.get(transfer.blockNumber) ?? [];
    atBlock.push(transfer);
    this.transfersByBlock.set(transfer.blockNumber, atBlock);
    return transfer;
  }

  private currentBlock(): number {
    return Math.max(0, Math.floor((this.now() - this.genesisTimestamp) / this.blockTimeMs));
  }
}
