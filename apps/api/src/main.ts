import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import { loadEnv } from '@cryptopay/config';
import { createLogger } from '@cryptopay/logger';
import { generateId } from '@cryptopay/shared';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({
    name: 'cryptopay-api',
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === 'development',
  });

  const adapter = new FastifyAdapter({
    genReqId: () => generateId('req'),
    loggerInstance: logger,
    trustProxy: true,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  // Registered on the raw Fastify instance rather than via Nest's app.register()
  // wrapper — Nest's platform-fastify re-exports its own FastifyInstance type
  // that structurally clashes with these plugins' own bundled types (a known
  // duplicate-nominal-type friction point), even though it's the same fastify
  // package/version underneath at runtime.
  const fastify = app.getHttpAdapter().getInstance();
  await fastify.register(fastifyCookie, { secret: env.SESSION_COOKIE_SECRET });
  await fastify.register(fastifyCors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Organization-Id'],
  });
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } },
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CryptoPay API')
    .setDescription('Non-custodial crypto payment infrastructure — Phase 0 (auth core)')
    .setVersion('0.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'cp_live_/cp_test_' }, 'apiKey')
    .addCookieAuth('cp_at')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('v1/docs', app, document, {
    jsonDocumentUrl: 'v1/openapi.json',
  });

  app.enableShutdownHooks();

  await app.listen(env.API_PORT, '0.0.0.0');
  logger.info(`API listening on :${env.API_PORT}`);
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap', error);
  process.exit(1);
});
