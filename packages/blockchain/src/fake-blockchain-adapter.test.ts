import { Prisma } from '@cryptopay/database';
import { describe, expect, it } from 'vitest';
import { FakeBlockchainAdapter } from './fake-blockchain-adapter.js';

function makeClock(startAt = 0) {
  let time = startAt;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('FakeBlockchainAdapter', () => {
  it('validates EVM-style addresses (spec: base network example)', () => {
    const adapter = new FakeBlockchainAdapter();
    expect(adapter.validateAddress(`0x${'a'.repeat(40)}`)).toBe(true);
    expect(adapter.validateAddress('not-an-address')).toBe(false);
    expect(adapter.validateAddress(`0x${'a'.repeat(39)}`)).toBe(false);
  });

  it('generates a distinct deposit address per call', () => {
    const adapter = new FakeBlockchainAdapter();
    const a = adapter.generateDepositAddress();
    const b = adapter.generateDepositAddress();
    expect(a).not.toBe(b);
    expect(adapter.validateAddress(a)).toBe(true);
  });

  it('reports null/not-found for an unknown transaction', async () => {
    const adapter = new FakeBlockchainAdapter();
    expect(await adapter.getTransaction('0xdoesnotexist')).toBeNull();
    await expect(adapter.getConfirmations('0xdoesnotexist')).rejects.toThrow();
  });

  it('records a simulated payment as a detectable token transfer', async () => {
    const clock = makeClock();
    const adapter = new FakeBlockchainAdapter({ now: clock.now, blockTimeMs: 1000 });
    const toAddress = adapter.generateDepositAddress();

    const transfer = adapter.simulatePayment({
      token: 'USDC',
      toAddress,
      amount: new Prisma.Decimal('49.00'),
    });

    const tx = await adapter.getTransaction(transfer.txHash);
    expect(tx).toMatchObject({ txHash: transfer.txHash, status: 'success' });

    const transfersAtBlock = await adapter.getTokenTransfers(transfer.blockNumber);
    expect(transfersAtBlock).toContainEqual(transfer);
  });

  it('accrues confirmations as simulated time passes, never instantly (spec §22/§24)', async () => {
    const clock = makeClock();
    const adapter = new FakeBlockchainAdapter({ now: clock.now, blockTimeMs: 1000 });
    const toAddress = adapter.generateDepositAddress();

    const transfer = adapter.simulatePayment({
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
