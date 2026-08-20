import { Global, Module } from '@nestjs/common';
import { loadEnv } from '@cryptopay/config';
import { ENV, type Env } from './env.provider.js';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
