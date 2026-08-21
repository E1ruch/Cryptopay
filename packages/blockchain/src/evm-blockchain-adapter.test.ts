import { TransactionReceiptNotFoundError, type PublicClient, type Transport } from 'viem';
import type { baseSepolia } from 'viem/chains';
import { describe, expect, it, vi } from 'vitest';
import { EvmBlockchainAdapter } from './evm-blockchain-adapter.js';
import { getTokenConfig } from './token-registry.js';

type BaseSepoliaClient = PublicClient<Transport, typeof baseSepolia>;

const USDC = getTokenConfig('base', 'USDC');
const TX_HASH = `0x${'a'.repeat(64)}` as const;
const FROM = `0x${'1'.repeat(40)}` as const;
const TO = `0x${'2'.repeat(40)}` as const;

function makeClient(overrides: Record<string, unknown> = {}): BaseSepoliaClient {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(100n),
    getTransactionReceipt: vi.fn().mockRejectedValue(new TransactionReceiptNotFoundError({ hash: TX_HASH })),
    getTransaction: vi.fn().mockRejectedValue(new Error('not found')),
    getLogs: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as BaseSepoliaClient;
}

describe('EvmBlockchainAdapter', () => {
  it('validates EIP-55 EVM addresses via viem', () => {
    const adapter = new EvmBlockchainAdapter({ network: 'base', rpcUrl: 'http://unused', client: makeClient() });
    expect(adapter.validateAddress(TO)).toBe(true);
    expect(adapter.validateAddress('not-an-address')).toBe(false);
  });

  it('returns null for a transaction that does not exist at all', async () => {
    const adapter = new EvmBlockchainAdapter({ network: 'base', rpcUrl: 'http://unused', client: makeClient() });
    expect(await adapter.getTransaction(TX_HASH)).toBeNull();
  });

  it('reports a mined, successful transaction', async () => {
    const client = makeClient({
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue({ transactionHash: TX_HASH, blockNumber: 42n, status: 'success' }),
    });
    const adapter = new EvmBlockchainAdapter({ network: 'base', rpcUrl: 'http://unused', client });
    expect(await adapter.getTransaction(TX_HASH)).toEqual({ txHash: TX_HASH, blockNumber: 42, status: 'success' });
  });

  it('getConfirmations throws NotFoundError for an unknown tx (matches FakeBlockchainAdapter)', async () => {
    const adapter = new EvmBlockchainAdapter({ network: 'base', rpcUrl: 'http://unused', client: makeClient() });
    await expect(adapter.getConfirmations(TX_HASH)).rejects.toThrow();
  });

  it('computes confirmations as latestBlock - txBlock + 1', async () => {
    const client = makeClient({
      getTransactionReceipt: vi.fn().mockResolvedValue({ blockNumber: 95n }),
      getBlockNumber: vi.fn().mockResolvedValue(100n),
    });
    const adapter = new EvmBlockchainAdapter({ network: 'base', rpcUrl: 'http://unused', client });
    expect(await adapter.getConfirmations(TX_HASH)).toBe(6);
  });

  it('decodes ERC-20 Transfer logs into TokenTransfers using the token registry decimals', async () => {
    const client = makeClient({
      getLogs: vi.fn().mockResolvedValue([
        {
          transactionHash: TX_HASH,
          blockNumber: 50n,
          args: { from: FROM, to: TO, value: 49_000_000n }, // 49.00 USDC, 6 decimals
        },
      ]),
    });
    const adapter = new EvmBlockchainAdapter({ network: 'base', rpcUrl: 'http://unused', client });

    const transfers = await adapter.getTokenTransfers(40, 60);

    expect(client.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ address: USDC.contractAddress, fromBlock: 40n, toBlock: 60n }),
    );
    expect(transfers).toHaveLength(1);
    const [transfer] = transfers;
    expect(transfer).toMatchObject({
      txHash: TX_HASH,
      network: 'base',
      token: 'USDC',
      fromAddress: FROM,
      toAddress: TO,
      blockNumber: 50,
    });
    expect(transfer?.amount.toString()).toBe('49');
  });
});
