import { envSchema, type Env } from './env.schema.js';

export class InvalidEnvironmentError extends Error {
  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

let cachedEnv: Env | undefined;

/**
 * Parses and validates process.env against envSchema. Fails fast with a
 * readable error rather than letting the app boot with missing/malformed
 * config (e.g. a short JWT secret, or a non-Postgres DATABASE_URL).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new InvalidEnvironmentError(issues);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

/** For tests only — clears the memoized env so loadEnv() re-parses. */
export function resetEnvCache(): void {
  cachedEnv = undefined;
}
