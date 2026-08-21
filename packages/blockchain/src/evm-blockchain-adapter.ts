import { Prisma } from '@cryptopay/database';
import { NotFoundError } from '@cryptopay/shared';
import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  parseAbiItem,
  TransactionReceiptNotFoundError,
  type Log,
  type PublicClient,
  type Transport,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import type { BlockchainAdapter, BlockchainTransaction, TokenTransfer } from './blockchain-adapter.js';
import { getTokensForNetwork } from './token-registry.js';

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

// Pinned to Base Sepolia's chain type — its OP-stack formatters (deposit
// txs etc.) make a bare, untyped `PublicClient` an incompatible assignment
// target, so both the real client and test doubles must share this exact type.
type BaseSepoliaClient = PublicClient<Transport, typeof baseSepolia>;

export interface EvmBlockchainAdapterOptions {
  network: string;
  rpcUrl: string;
  /** Injectable client for tests — production callers never set this. */
  client?: BaseSepoliaClient;
}

/**
 * Real {@link BlockchainAdapter} for an EVM chain (Phase 2 — Base Sepolia
 * testnet, spec §93). Only ever *observes* chain state via a read-only RPC
 * client — never signs or broadcasts anything, matching the custody
 * boundary in spec §42 (this adapter holds no key of any kind).
 */
export class EvmBlockchainAdapter implements BlockchainAdapter {
  private readonly client: BaseSepoliaClient;
  private readonly network: string;

  constructor(options: EvmBlockchainAdapterOptions) {
    this.network = options.network;
    this.client = options.client ?? createPublicClient({ chain: baseSepolia, transport: http(options.rpcUrl) });
  }

  validateAddress(address: string): boolean {
    return isAddress(address);
  }

  async getLatestBlock(): Promise<number> {
    const block = await this.client.getBlockNumber();
    return Number(block);
  }

  async getTransaction(txHash: string): Promise<BlockchainTransaction | null> {
    const hash = txHash as `0x${string}`;
    try {
      const receipt = await this.client.getTransactionReceipt({ hash });
      return {
        txHash: receipt.transactionHash,
        blockNumber: Number(receipt.blockNumber),
        status: receipt.status === 'success' ? 'success' : 'failed',
      };
    } catch (error) {
      if (!(error instanceof TransactionReceiptNotFoundError)) throw error;
    }

    // Not yet mined — distinguish "exists in mempool" from "doesn't exist at
    // all" (a real chain, unlike the fake one, genuinely has this state).
    try {
      const tx = await this.client.getTransaction({ hash });
      return { txHash: tx.hash, blockNumber: tx.blockNumber ? Number(tx.blockNumber) : 0, status: 'pending' };
    } catch {
      return null;
    }
  }

  /** One ranged `eth_getLogs` call per token per tick (spec §21 "Block Scanner") — never one call per block. */
  async getTokenTransfers(fromBlock: number, toBlock: number): Promise<TokenTransfer[]> {
    const tokens = Object.entries(getTokensForNetwork(this.network));
    const transfers: TokenTransfer[] = [];

    for (const [token, config] of tokens) {
      const logs = await this.client.getLogs({
        address: config.contractAddress,
        event: TRANSFER_EVENT,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock),
      });

      for (const log of logs as (Log & { args: { from: `0x${string}`; to: `0x${string}`; value: bigint } })[]) {
        // A finalized-range getLogs result always has these — null only
        // applies to a still-pending log, which a mined block range never returns.
        if (!log.transactionHash || log.blockNumber === null) continue;
        transfers.push({
          txHash: log.transactionHash,
          network: this.network,
          token,
          fromAddress: log.args.from,
          toAddress: log.args.to,
          amount: new Prisma.Decimal(formatUnits(log.args.value, config.decimals)),
          blockNumber: Number(log.blockNumber),
        });
      }
    }

    return transfers;
  }

  async getConfirmations(txHash: string): Promise<number> {
    const hash = txHash as `0x${string}`;
    let receipt;
    try {
      receipt = await this.client.getTransactionReceipt({ hash });
    } catch (error) {
      if (error instanceof TransactionReceiptNotFoundError) {
        throw new NotFoundError(`No transaction found for tx hash ${txHash}`);
      }
      throw error;
    }
    const latestBlock = await this.client.getBlockNumber();
    return Math.max(0, Number(latestBlock - receipt.blockNumber) + 1);
  }
}
