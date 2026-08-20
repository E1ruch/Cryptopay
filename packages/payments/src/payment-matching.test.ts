import { describe, expect, it } from 'vitest';
import { matchesInvoice } from './payment-matching.js';

const target = { network: 'base', token: 'USDC', paymentAddress: '0xAbC123' };

describe('matchesInvoice', () => {
  it('matches when network, token, and address all agree', () => {
    expect(matchesInvoice(target, { network: 'base', token: 'USDC', toAddress: '0xabc123' })).toBe(
      true,
    );
  });

  it('is case-insensitive on the address (spec: EVM checksum vs lowercase)', () => {
    expect(matchesInvoice(target, { network: 'base', token: 'USDC', toAddress: '0xABC123' })).toBe(
      true,
    );
  });

  it('rejects a transfer on the wrong network (spec §47)', () => {
    expect(matchesInvoice(target, { network: 'ethereum', token: 'USDC', toAddress: '0xAbC123' })).toBe(
      false,
    );
  });

  it('rejects a transfer of the wrong token', () => {
    expect(matchesInvoice(target, { network: 'base', token: 'USDT', toAddress: '0xAbC123' })).toBe(
      false,
    );
  });

  it('rejects a transfer to a different address', () => {
    expect(matchesInvoice(target, { network: 'base', token: 'USDC', toAddress: '0xdeadbeef' })).toBe(
      false,
    );
  });
});
