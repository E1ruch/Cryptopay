import { PrismaClient } from '../generated/client/index.js';

export interface CreatePrismaClientOptions {
  databaseUrl: string;
  /** Verbose query logging — enable in local dev only, never in production. */
  logQueries?: boolean;
}

export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: options.databaseUrl } },
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

// Node's module cache already makes this a singleton per process — the only
// real risk is Next.js/ts-node hot-reload spawning duplicate clients and
// exhausting Postgres connections, so we pin it on globalThis in dev.
declare global {
  var __cryptopayPrisma: PrismaClient | undefined;
}

export function getPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return createPrismaClient(options);
  }
  globalThis.__cryptopayPrisma ??= createPrismaClient(options);
  return globalThis.__cryptopayPrisma;
}
