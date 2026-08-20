import pino, { type Logger } from 'pino';
import { buildRedactPaths } from './redact-paths.js';

export interface CreateLoggerOptions {
  name: string;
  level?: string;
  /** Pretty-print for local dev; disable in production for structured JSON. */
  pretty?: boolean;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const { name, level = 'info', pretty = false } = options;

  return pino({
    name,
    level,
    redact: {
      paths: buildRedactPaths(),
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss.l' },
          },
        }
      : {}),
  });
}

export interface RequestContext {
  requestId: string;
  correlationId?: string;
  organizationId?: string;
}

/** Binds request/correlation IDs so every downstream log line can be traced
 * across API -> worker -> webhook (spec §89). */
export function withRequestContext(logger: Logger, context: RequestContext): Logger {
  return logger.child(context);
}
