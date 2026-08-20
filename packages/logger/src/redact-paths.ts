/**
 * Wildcard field names that must never reach log output, regardless of
 * nesting depth (pino's redact matches these against every object level
 * when the leading `*` form is used).
 *
 * Spec §39 / §83: never log passwords, API secrets, private keys, auth
 * tokens, or full sensitive personal data.
 */
export const SENSITIVE_FIELD_NAMES = [
  'password',
  'password_hash',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'apiKey',
  'api_key',
  'key_hash',
  'keyHash',
  'secret',
  'clientSecret',
  'privateKey',
  'private_key',
  'mnemonic',
  'seedPhrase',
  'seed_phrase',
  'totpSecret',
  'twoFactorSecret',
  'authorization',
  'cookie',
  'set-cookie',
  'csrfToken',
  'signature',
];

export function buildRedactPaths(): string[] {
  const paths: string[] = [];
  for (const field of SENSITIVE_FIELD_NAMES) {
    paths.push(field, `*.${field}`, `*.*.${field}`, `*.*.*.${field}`);
  }
  return paths;
}
