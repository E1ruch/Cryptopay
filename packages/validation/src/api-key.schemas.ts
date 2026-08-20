import { z } from 'zod';
import { API_KEY_SCOPES, API_KEY_ENVIRONMENTS } from '@cryptopay/shared';

export const createApiKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  environment: z.enum(API_KEY_ENVIRONMENTS),
  // Least privilege by default (spec §75): explicit empty array must be passed
  // deliberately, an omitted field does not implicitly grant every scope.
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
