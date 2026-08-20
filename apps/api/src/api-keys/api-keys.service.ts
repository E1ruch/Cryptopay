import { Inject, Injectable } from '@nestjs/common';
import { generateApiKey } from '@cryptopay/crypto';
import { NotFoundError } from '@cryptopay/shared';
import type { CreateApiKeyInput } from '@cryptopay/validation';
import type { ApiKey } from '@cryptopay/database';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ENV, type Env } from '../config/env.provider.js';
import type { RequestContext } from '../common/request-context.util.js';

export interface CreatedApiKey {
  apiKey: ApiKey;
  /** Shown exactly once — never persisted or logged (spec §15). */
  rawKey: string;
}

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    organizationId: string,
    input: CreateApiKeyInput,
    actorId: string,
    ctx: RequestContext,
  ): Promise<CreatedApiKey> {
    const generated = generateApiKey(input.environment, this.env.API_KEY_PEPPER);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        organizationId,
        name: input.name,
        environment: input.environment,
        keyPrefix: generated.prefix,
        keyHash: generated.hash,
        scopes: input.scopes,
      },
    });

    await this.audit.record({
      organizationId,
      actorId,
      actorType: 'user',
      action: 'api_key.create',
      resourceType: 'api_key',
      resourceId: apiKey.id,
      metadata: { environment: input.environment, scopes: input.scopes },
      ...ctx,
    });

    return { apiKey, rawKey: generated.raw };
  }

  async list(organizationId: string): Promise<ApiKey[]> {
    return this.prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revokes an API key — but only if it belongs to the caller's organization.
   * This is the canonical BOLA check for this resource (spec §12/§74): a
   * bare key id from another organization must never be revocable here.
   */
  async revoke(organizationId: string, apiKeyId: string, actorId: string, ctx: RequestContext): Promise<void> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id: apiKeyId, organizationId },
    });
    if (!apiKey) {
      throw new NotFoundError('API key not found');
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      organizationId,
      actorId,
      actorType: 'user',
      action: 'api_key.revoke',
      resourceType: 'api_key',
      resourceId: apiKey.id,
      ...ctx,
    });
  }
}
