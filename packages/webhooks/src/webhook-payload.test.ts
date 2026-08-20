import { signHmacSha256 } from '@cryptopay/crypto';
import { describe, expect, it } from 'vitest';
import { buildWebhookPayload, signWebhookRequest, verifyWebhookSignature } from './webhook-payload.js';

describe('webhook payload signing (spec §27/§61)', () => {
  it('builds the documented payload shape', () => {
    const payload = buildWebhookPayload({
      eventId: 'evt_123',
      type: 'payment.paid',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      data: { invoice_id: 'inv_123', status: 'paid' },
    });
    expect(payload).toEqual({
      id: 'evt_123',
      type: 'payment.paid',
      created: 1767225600,
      data: { invoice_id: 'inv_123', status: 'paid' },
    });
  });

  it('produces a signature a merchant can verify with the same secret', () => {
    const payload = buildWebhookPayload({
      eventId: 'evt_123',
      type: 'payment.paid',
      createdAt: new Date(),
      data: {},
    });
    const { body, headers } = signWebhookRequest(payload, 'whsec_abc');

    expect(
      verifyWebhookSignature(
        body,
        'whsec_abc',
        headers['X-CryptoPay-Timestamp'],
        headers['X-CryptoPay-Signature'],
      ),
    ).toBe(true);
  });

  it('rejects a signature verified with the wrong secret', () => {
    const payload = buildWebhookPayload({ eventId: 'evt_1', type: 'x', createdAt: new Date(), data: {} });
    const { body, headers } = signWebhookRequest(payload, 'whsec_abc');
    expect(
      verifyWebhookSignature(body, 'whsec_wrong', headers['X-CryptoPay-Timestamp'], headers['X-CryptoPay-Signature']),
    ).toBe(false);
  });

  it('rejects a tampered body even with a structurally valid signature', () => {
    const payload = buildWebhookPayload({ eventId: 'evt_1', type: 'x', createdAt: new Date(), data: { amount: '49.00' } });
    const { headers } = signWebhookRequest(payload, 'whsec_abc');
    const tamperedBody = JSON.stringify({ ...payload, data: { amount: '9999.00' } });
    expect(
      verifyWebhookSignature(
        tamperedBody,
        'whsec_abc',
        headers['X-CryptoPay-Timestamp'],
        headers['X-CryptoPay-Signature'],
      ),
    ).toBe(false);
  });

  it('rejects an old timestamp even when correctly signed (replay protection, spec §61)', () => {
    const payload = buildWebhookPayload({ eventId: 'evt_1', type: 'x', createdAt: new Date(), data: {} });
    const body = JSON.stringify(payload);
    const staleTimestamp = (Math.floor(Date.now() / 1000) - 3600).toString(); // 1h old
    const validSignatureForStaleTimestamp = signHmacSha256(`${staleTimestamp}.${body}`, 'whsec_abc');

    expect(verifyWebhookSignature(body, 'whsec_abc', staleTimestamp, validSignatureForStaleTimestamp)).toBe(false);
  });
});
