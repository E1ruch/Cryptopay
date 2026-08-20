import { encryptSecret } from '@cryptopay/crypto';
import { describe, expect, it, vi } from 'vitest';
import { deliverWebhook } from './deliver-webhook.js';

const ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex
const SECRET = 'whsec_test';
const endpoint = { url: 'https://merchant.example.com/webhook', secretEnc: encryptSecret(SECRET, ENCRYPTION_KEY) };
const event = { id: 'evt_1', type: 'payment.paid', createdAt: new Date(), data: { invoice_id: 'inv_1' } };
// Stubs DNS so these are real unit tests, not network-dependent ones.
const resolvesPublic: () => Promise<{ address: string }[]> = () => Promise.resolve([{ address: '93.184.216.34' }]);

describe('deliverWebhook', () => {
  it('signs and POSTs the payload, reporting success on 2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    const result = await deliverWebhook({
      endpoint,
      event,
      encryptionKey: ENCRYPTION_KEY,
      fetchImpl,
      lookupFn: resolvesPublic,
    });

    expect(result).toMatchObject({ success: true, statusCode: 200 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(endpoint.url);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual'); // spec §29: never blindly follow redirects
    const headers = init.headers as Record<string, string>;
    expect(headers['X-CryptoPay-Event-ID']).toBe('evt_1');
    expect(headers['X-CryptoPay-Signature']).toBeTruthy();
  });

  it('reports failure on a non-2xx response without throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const result = await deliverWebhook({
      endpoint,
      event,
      encryptionKey: ENCRYPTION_KEY,
      fetchImpl,
      lookupFn: resolvesPublic,
    });
    expect(result).toMatchObject({ success: false, statusCode: 500 });
  });

  it('reports failure when the fetch itself throws (network error)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await deliverWebhook({
      endpoint,
      event,
      encryptionKey: ENCRYPTION_KEY,
      fetchImpl,
      lookupFn: resolvesPublic,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('refuses to deliver to a URL that fails SSRF validation, without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const result = await deliverWebhook({
      endpoint: { url: 'http://merchant.example.com/webhook', secretEnc: endpoint.secretEnc },
      event,
      encryptionKey: ENCRYPTION_KEY,
      fetchImpl,
      lookupFn: resolvesPublic,
    });
    expect(result.success).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
