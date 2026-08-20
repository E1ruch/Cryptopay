import { decryptSecret } from '@cryptopay/crypto';
import { assertSafeWebhookUrl, type LookupFn } from './ssrf-guard.js';
import { buildWebhookPayload, signWebhookRequest } from './webhook-payload.js';

export interface DeliverWebhookInput {
  endpoint: { url: string; secretEnc: string };
  event: { id: string; type: string; createdAt: Date; data: unknown };
  encryptionKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  lookupFn?: LookupFn;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  responseTimeMs: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * One delivery attempt end to end (spec §27/§29): decrypt the endpoint's
 * signing secret, re-validate the URL is still safe to fetch (SSRF is a
 * TOCTOU risk — DNS can change between registration and send), sign the
 * payload, and POST with a timeout and no automatic redirect-following
 * (spec §29: "validate redirect behavior" — the safest validation is not
 * to follow one at all, since a 3xx could repoint at an internal address).
 */
export async function deliverWebhook(input: DeliverWebhookInput): Promise<WebhookDeliveryResult> {
  const start = Date.now();
  try {
    await assertSafeWebhookUrl(input.endpoint.url, input.lookupFn);
  } catch (error) {
    return {
      success: false,
      responseTimeMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Webhook URL failed safety validation',
    };
  }

  const secret = decryptSecret(input.endpoint.secretEnc, input.encryptionKey);
  const payload = buildWebhookPayload({
    eventId: input.event.id,
    type: input.event.type,
    createdAt: input.event.createdAt,
    data: input.event.data as Record<string, unknown>,
  });
  const { body, headers } = signWebhookRequest(payload, secret);

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchImpl(input.endpoint.url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    const responseTimeMs = Date.now() - start;

    if (response.status >= 200 && response.status < 300) {
      return { success: true, statusCode: response.status, responseTimeMs };
    }
    return {
      success: false,
      statusCode: response.status,
      responseTimeMs,
      error: `Merchant endpoint responded with HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      responseTimeMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Webhook delivery failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}
