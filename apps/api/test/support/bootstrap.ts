import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { loadEnv } from '@cryptopay/config';
import { AppModule } from '../../src/app.module.js';

export async function createTestApp(): Promise<NestFastifyApplication> {
  const env = loadEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  const fastify = app.getHttpAdapter().getInstance();
  await fastify.register(fastifyCookie, { secret: env.SESSION_COOKIE_SECRET });

  await app.init();
  await fastify.ready();
  return app;
}

/** Parses `Set-Cookie` response headers into a simple name -> value map. */
export function parseSetCookies(setCookieHeader: string | string[] | undefined): Record<string, string> {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  const cookies: Record<string, string> = {};
  for (const header of headers) {
    const [pair] = header.split(';');
    if (!pair) continue;
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) continue;
    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    cookies[name] = value;
  }
  return cookies;
}

export function toCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/** Inverse of toCookieHeader — parses a `Cookie:` request header back into a map. */
export function parseCookieHeader(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(';')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) continue;
    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}
