import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '@cryptopay/shared';

export const SCOPES_KEY = 'scopes';
export const RequireScopes = (...scopes: ApiKeyScope[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(SCOPES_KEY, scopes);
