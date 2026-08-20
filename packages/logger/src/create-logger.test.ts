import { describe, expect, it, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import { buildRedactPaths } from './redact-paths.js';

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const logger = pino({ redact: { paths: buildRedactPaths(), censor: '[REDACTED]' } }, stream);
  return { logger, lines };
}

function parseLine<T>(lines: string[]): T {
  return JSON.parse(lines[0] ?? '{}') as T;
}

interface PasswordLogEntry {
  password: string;
  email: string;
}

interface CredentialsLogEntry {
  user: { apiKey: string; token: string };
}

interface RequestHeadersLogEntry {
  req: { headers: { authorization: string } };
}

interface RequestContextLogEntry {
  requestId: string;
  organizationId: string;
}

describe('logger redaction', () => {
  let capture: ReturnType<typeof captureLogger>;

  beforeEach(() => {
    capture = captureLogger();
  });

  it('redacts top-level password field', () => {
    capture.logger.info({ password: 'hunter2', email: 'a@b.com' }, 'login attempt');
    const entry = parseLine<PasswordLogEntry>(capture.lines);
    expect(entry.password).toBe('[REDACTED]');
    expect(entry.email).toBe('a@b.com');
  });

  it('redacts nested apiKey and token fields', () => {
    capture.logger.info(
      { user: { apiKey: 'cp_live_xxx', token: 'abc.def.ghi' } },
      'issued credentials',
    );
    const entry = parseLine<CredentialsLogEntry>(capture.lines);
    expect(entry.user.apiKey).toBe('[REDACTED]');
    expect(entry.user.token).toBe('[REDACTED]');
  });

  it('redacts authorization headers', () => {
    capture.logger.info({ req: { headers: { authorization: 'Bearer secret' } } }, 'request');
    const entry = parseLine<RequestHeadersLogEntry>(capture.lines);
    expect(entry.req.headers.authorization).toBe('[REDACTED]');
  });

  it('does not redact unrelated fields', () => {
    capture.logger.info({ requestId: 'req_123', organizationId: 'org_456' }, 'request context');
    const entry = parseLine<RequestContextLogEntry>(capture.lines);
    expect(entry.requestId).toBe('req_123');
    expect(entry.organizationId).toBe('org_456');
  });
});
