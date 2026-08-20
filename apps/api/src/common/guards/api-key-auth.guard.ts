import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@cryptopay/shared';
import { hashApiKey, parseApiKeyEnvironment } from '@cryptopay/crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { ENV, type Env } from '../../config/env.provider.js';

/**
 * Validates `Authorization: Bearer cp_test_/cp_live_...` for the public
 * Merchant API (spec §15/§50). Not used by dashboard routes — those use
 * SessionAuthGuard + OrganizationScopeGuard instead.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing API key');
    }

    const raw = header.slice('Bearer '.length).trim();
    const environment = parseApiKeyEnvironment(raw);
    if (!environment) {
      throw new UnauthorizedError('Malformed API key');
    }

    const keyHash = hashApiKey(raw, this.env.API_KEY_PEPPER);
    const apiKey = await this.prisma.apiKey.findUnique({ where: { keyHash } });

    if (!apiKey || apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
      throw new UnauthorizedError('Invalid or revoked API key');
    }

    request.organizationId = apiKey.organizationId;
    request.apiKeyId = apiKey.id;
    request.apiKeyScopes = apiKey.scopes;

    // Best-effort — must never block or fail the request.
    void this.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return true;
  }
}
