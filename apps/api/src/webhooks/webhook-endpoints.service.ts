import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type WebhookEndpoint } from '@cryptopay/database';
import { encryptSecret, generateWebhookSecret } from '@cryptopay/crypto';
import { generateId, NotFoundError } from '@cryptopay/shared';
import type { CreateWebhookEndpointInput } from '@cryptopay/validation';
import { assertSafeWebhookUrl } from '@cryptopay/webhooks';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../common/request-context.util.js';
import { ENV, type Env } from '../config/env.provider.js';
import { PrismaService } from '../database/prisma.service.js';

// Exported so the `typeof` reference below counts as a use of this value,
// and so callers (the dashboard presenter) can name listDeliveries' return type.
export const deliveryWithEvent = Prisma.validator<Prisma.WebhookDeliveryDefaultArgs>()({
  include: { event: { select: { type: true, createdAt: true } } },
});
export type DeliveryWithEvent = Prisma.WebhookDeliveryGetPayload<typeof deliveryWithEvent>;

export interface CreatedWebhookEndpoint {
  endpoint: WebhookEndpoint;
  /** Shown exactly once — never persisted or logged in plaintext (spec §15 pattern reused). */
  secret: string;
}

/** Who's calling — the merchant API (API key) or the dashboard (a logged-in user). */
export interface Actor {
  id: string;
  type: 'user' | 'api_key';
}

@Injectable()
export class WebhookEndpointsService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    organizationId: string,
    actor: Actor,
    input: CreateWebhookEndpointInput,
    ctx: RequestContext,
  ): Promise<CreatedWebhookEndpoint> {
    const url = await assertSafeWebhookUrl(input.url);

    const secret = generateWebhookSecret();
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        id: generateId('we'),
        organizationId,
        url: url.toString(),
        secretEnc: encryptSecret(secret, this.env.ENCRYPTION_KEY),
      },
    });

    await this.audit.record({
      organizationId,
      actorId: actor.id,
      actorType: actor.type,
      action: 'webhook_endpoint.create',
      resourceType: 'webhook_endpoint',
      resourceId: endpoint.id,
      ...ctx,
    });

    return { endpoint, secret };
  }

  async list(organizationId: string): Promise<WebhookEndpoint[]> {
    return this.prisma.webhookEndpoint.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** BOLA-safe: revoke only ever matches within the caller's own organization (spec §12). */
  async revoke(organizationId: string, endpointId: string, actor: Actor, ctx: RequestContext): Promise<void> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, organizationId },
    });
    if (!endpoint) {
      throw new NotFoundError('Webhook endpoint not found');
    }

    await this.prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { enabled: false, revokedAt: new Date() },
    });

    await this.audit.record({
      organizationId,
      actorId: actor.id,
      actorType: actor.type,
      action: 'webhook_endpoint.revoke',
      resourceType: 'webhook_endpoint',
      resourceId: endpoint.id,
      ...ctx,
    });
  }

  /**
   * Recent delivery attempts for one endpoint — spec §28: "Merchant
   * dashboard must show delivery status." BOLA-safe: the endpoint lookup is
   * scoped by organizationId before any deliveries are read.
   */
  async listDeliveries(organizationId: string, endpointId: string, limit = 50): Promise<DeliveryWithEvent[]> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, organizationId },
    });
    if (!endpoint) {
      throw new NotFoundError('Webhook endpoint not found');
    }

    return this.prisma.webhookDelivery.findMany({
      where: { endpointId },
      include: { event: { select: { type: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
