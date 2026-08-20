import { signHmacSha256, verifyHmacSha256 } from '@cryptopay/crypto';

export interface WebhookEventPayload {
  id: string;
  type: string;
  created: number;
  data: Record<string, unknown>;
}

export function buildWebhookPayload(input: {
  eventId: string;
  type: string;
  createdAt: Date;
  data: Record<string, unknown>;
}): WebhookEventPayload {
  return {
    id: input.eventId,
    type: input.type,
    created: Math.floor(input.createdAt.getTime() / 1000),
    data: input.data,
  };
}

export interface SignedWebhookRequest {
  body: string;
  headers: {
    'X-CryptoPay-Signature': string;
    'X-CryptoPay-Timestamp': string;
    'X-CryptoPay-Event-ID': string;
    'Content-Type': string;
  };
}

/**
 * Signs `${timestamp}.${body}` rather than the body alone (spec §27/§61) —
 * binding the timestamp into the signature is what lets a merchant reject a
 * replayed-but-still-validly-signed old request by its age alone.
 */
export function signWebhookRequest(payload: WebhookEventPayload, secret: string): SignedWebhookRequest {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signHmacSha256(`${timestamp}.${body}`, secret);
  return {
    body,
    headers: {
      'X-CryptoPay-Signature': signature,
      'X-CryptoPay-Timestamp': timestamp,
      'X-CryptoPay-Event-ID': payload.id,
      'Content-Type': 'application/json',
    },
  };
}

/** Reference implementation of the verification spec §61 asks CryptoPay to document for merchants. */
export function verifyWebhookSignature(
  body: string,
  secret: string,
  timestamp: string,
  signatureHex: string,
  toleranceSeconds = 300,
): boolean {
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) return false; // spec §61: reject old timestamp

  return verifyHmacSha256(`${timestamp}.${body}`, secret, signatureHex);
}
