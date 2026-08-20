import type { DeliveryWithEvent } from '../webhooks/webhook-endpoints.service.js';

export interface WebhookDeliveryView {
  id: string;
  eventType: string;
  attempt: number;
  status: string;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
  nextRetryAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

export function toWebhookDeliveryView(delivery: DeliveryWithEvent): WebhookDeliveryView {
  return {
    id: delivery.id,
    eventType: delivery.event.type,
    attempt: delivery.attempt,
    status: delivery.status,
    statusCode: delivery.statusCode,
    responseTimeMs: delivery.responseTimeMs,
    error: delivery.error,
    nextRetryAt: delivery.nextRetryAt,
    deliveredAt: delivery.deliveredAt,
    createdAt: delivery.createdAt,
  };
}
