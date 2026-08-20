import type { FastifyRequest } from 'fastify';

export interface RequestContext {
  ip: string;
  userAgent?: string;
}

export function extractRequestContext(request: FastifyRequest): RequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {}),
  };
}
