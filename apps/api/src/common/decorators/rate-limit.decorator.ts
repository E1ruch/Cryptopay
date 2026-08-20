import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimitCategory';
export type RateLimitCategory = 'login' | 'global' | 'checkout';

export const RateLimit = (category: RateLimitCategory): ReturnType<typeof SetMetadata> =>
  SetMetadata(RATE_LIMIT_KEY, category);
