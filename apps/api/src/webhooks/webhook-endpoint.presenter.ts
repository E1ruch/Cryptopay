import type { WebhookEndpoint } from '@cryptopay/database';

export interface WebhookEndpointView {
  id: string;
  url: string;
  enabled: boolean;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** secretEnc must never leave the server — this is the only place a
 * WebhookEndpoint record is allowed to cross the HTTP boundary. */
export function toWebhookEndpointView(endpoint: WebhookEndpoint): WebhookEndpointView {
  return {
    id: endpoint.id,
    url: endpoint.url,
    enabled: endpoint.enabled,
    revokedAt: endpoint.revokedAt,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}
