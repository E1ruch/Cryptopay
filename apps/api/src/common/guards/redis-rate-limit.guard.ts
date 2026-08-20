import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { RateLimitedError } from '@cryptopay/shared';
import { RedisService } from '../../redis/redis.service.js';
import { ENV, type Env } from '../../config/env.provider.js';
import { RATE_LIMIT_KEY, type RateLimitCategory } from '../decorators/rate-limit.decorator.js';

interface ResolvedLimit {
  limit: number;
  windowSeconds: number;
  keyBy: 'ip' | 'ip-email';
}

/** Fixed-window counter (INCR+EXPIRE) — simple and sufficient for Phase 0
 * (spec §30: configurable per-endpoint rate limiting, Redis-backed). */
@Injectable()
export class RedisRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const category = this.reflector.getAllAndOverride<RateLimitCategory | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!category) return true;

    const { limit, windowSeconds, keyBy } = this.resolveLimit(category);
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    let identity = request.ip;
    if (keyBy === 'ip-email') {
      const body = request.body as { email?: unknown } | undefined;
      if (body && typeof body.email === 'string') {
        identity = `${request.ip}:${body.email.toLowerCase()}`;
      }
    }

    const redisKey = `ratelimit:${category}:${request.url}:${identity}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.expire(redisKey, windowSeconds);
    }

    if (count > limit) {
      throw new RateLimitedError('Too many requests, please try again later');
    }
    return true;
  }

  private resolveLimit(category: RateLimitCategory): ResolvedLimit {
    if (category === 'login') {
      return { limit: this.env.RATE_LIMIT_LOGIN_PER_MINUTE, windowSeconds: 60, keyBy: 'ip-email' };
    }
    if (category === 'checkout') {
      return { limit: this.env.RATE_LIMIT_CHECKOUT_PER_MINUTE, windowSeconds: 60, keyBy: 'ip' };
    }
    return { limit: this.env.RATE_LIMIT_GLOBAL_PER_MINUTE, windowSeconds: 60, keyBy: 'ip' };
  }
}
