import { Prisma } from '@cryptopay/database';
import { describe, expect, it } from 'vitest';
import { matchesInvoice, selectMatchingInvoice } from './payment-matching.js';

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

describe('selectMatchingInvoice', () => {
  const address = '0xAbC123';
  const base = { network: 'base', token: 'USDC', paymentAddress: address };

  function invoice(id: string, amount: string, createdAt: string) {
    return { id, amount: new Prisma.Decimal(amount), createdAt: new Date(createdAt), ...base };
  }

  it('returns null when no candidate matches network/token/address', () => {
    const candidates = [invoice('inv_1', '10.00', '2026-01-01')];
    const result = selectMatchingInvoice(candidates, {
      network: 'ethereum',
      token: 'USDC',
      toAddress: address,
      amount: new Prisma.Decimal('10.00'),
    });
    expect(result).toBeNull();
  });

  it('prefers the candidate whose expected amount exactly matches the transfer', () => {
    const candidates = [invoice('inv_older', '10.00', '2026-01-01'), invoice('inv_exact', '25.00', '2026-01-02')];
    const result = selectMatchingInvoice(candidates, {
      network: 'base',
      token: 'USDC',
      toAddress: address,
      amount: new Prisma.Decimal('25.00'),
    });
    expect(result?.id).toBe('inv_exact');
  });

  it('falls back to the oldest pending invoice when no amount matches exactly', () => {
    const candidates = [invoice('inv_newer', '10.00', '2026-01-02'), invoice('inv_older', '20.00', '2026-01-01')];
    const result = selectMatchingInvoice(candidates, {
      network: 'base',
      token: 'USDC',
      toAddress: address,
      amount: new Prisma.Decimal('15.00'),
    });
    expect(result?.id).toBe('inv_older');
  });
});
