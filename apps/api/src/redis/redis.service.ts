import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.provider.js';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 3 });
  }

  onModuleDestroy(): void {
    this.disconnect();
  }
}
