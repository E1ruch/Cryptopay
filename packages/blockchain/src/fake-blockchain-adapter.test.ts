import { Prisma } from '@cryptopay/database';
import { describe, expect, it } from 'vitest';
import { FakeBlockchainAdapter, generateFakeAddress } from './fake-blockchain-adapter.js';

function makeClock(startAt = 0) {
  let time = startAt;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('generateFakeAddress', () => {
  it('generates distinct, individually valid EVM-style addresses', () => {
    const adapter = new FakeBlockchainAdapter();
    const a = generateFakeAddress();
    const b = generateFakeAddress();
    expect(a).not.toBe(b);
    expect(adapter.validateAddress(a)).toBe(true);
  });
});

describe('FakeBlockchainAdapter', () => {
  it('validates EVM-style addresses (spec: base network example)', () => {
    const adapter = new FakeBlockchainAdapter();
    expect(adapter.validateAddress(`0x${'a'.repeat(40)}`)).toBe(true);
    expect(adapter.validateAddress('not-an-address')).toBe(false);
    expect(adapter.validateAddress(`0x${'a'.repeat(39)}`)).toBe(false);
  });

  it('reports null/not-found for an unknown transaction', async () => {
    const adapter = new FakeBlockchainAdapter();
    expect(await adapter.getTransaction('0xdoesnotexist')).toBeNull();
    await expect(adapter.getConfirmations('0xdoesnotexist')).rejects.toThrow();
  });

  it('records a simulated payment as a detectable token transfer', async () => {
    const clock = makeClock();
    const adapter = new FakeBlockchainAdapter({ now: clock.now, blockTimeMs: 1000 });
    const toAddress = generateFakeAddress();

    const transfer = adapter.simulatePayment({
      network: 'base',
      token: 'USDC',
      toAddress,
      amount: new Prisma.Decimal('49.00'),
    });

    const tx = await adapter.getTransaction(transfer.txHash);
    expect(tx).toMatchObject({ txHash: transfer.txHash, status: 'success' });

    const transfersAtBlock = await adapter.getTokenTransfers(transfer.blockNumber, transfer.blockNumber);
    expect(transfersAtBlock).toContainEqual(transfer);
  });

  it('collects transfers across a ranged block scan', async () => {
    const clock = makeClock();
    const adapter = new FakeBlockchainAdapter({ now: clock.now, blockTimeMs: 1000 });

    const first = adapter.simulatePayment({
      network: 'base',
      token: 'USDC',
      toAddress: generateFakeAddress(),
      amount: new Prisma.Decimal('10.00'),
    });
    clock.advance(2000);
    const second = adapter.simulatePayment({
      network: 'base',
      token: 'USDC',
      toAddress: generateFakeAddress(),
      amount: new Prisma.Decimal('20.00'),
    });

    const transfers = await adapter.getTokenTransfers(0, await adapter.getLatestBlock());
    expect(transfers).toEqual(expect.arrayContaining([first, second]));
  });

  it('accrues confirmations as simulated time passes, never instantly (spec §22/§24)', async () => {
    const clock = makeClock();
    const adapter = new FakeBlockchainAdapter({ now: clock.now, blockTimeMs: 1000 });
    const toAddress = generateFakeAddress();

    const transfer = adapter.simulatePayment({
      network: 'base',
      token: 'USDC',
      toAddress,
      amount: new Prisma.Decimal('49.00'),
    });

    expect(await adapter.getConfirmations(transfer.txHash)).toBe(0);

    clock.advance(3500);
    expect(await adapter.getConfirmations(transfer.txHash)).toBe(3);

    clock.advance(1000);
    expect(await adapter.getConfirmations(transfer.txHash)).toBe(4);
  });
});
