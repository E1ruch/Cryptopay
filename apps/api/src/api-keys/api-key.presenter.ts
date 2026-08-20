import type { ApiKey } from '@cryptopay/database';

export interface ApiKeyView {
  id: string;
  name: string;
  environment: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** keyHash must never leave the server (spec §15) — this is the only place
 * an ApiKey record is allowed to cross the HTTP boundary. */
export function toApiKeyView(apiKey: ApiKey): ApiKeyView {
  return {
    id: apiKey.id,
    name: apiKey.name,
    environment: apiKey.environment,
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes,
    lastUsedAt: apiKey.lastUsedAt,
    expiresAt: apiKey.expiresAt,
    revokedAt: apiKey.revokedAt,
    createdAt: apiKey.createdAt,
  };
}
