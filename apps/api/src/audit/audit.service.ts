import { Injectable } from '@nestjs/common';
import { Prisma } from '@cryptopay/database';
import { PrismaService } from '../database/prisma.service.js';

export interface RecordAuditEventInput {
  organizationId?: string;
  actorId?: string;
  actorType: 'user' | 'api_key' | 'admin' | 'system';
  action: string;
  resourceType: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    const data: Prisma.AuditLogCreateInput = {
      actorType: input.actorType,
      action: input.action,
      resourceType: input.resourceType,
      ...(input.organizationId !== undefined
        ? { organization: { connect: { id: input.organizationId } } }
        : {}),
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
      ...(input.ip !== undefined ? { ip: input.ip } : {}),
      ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
      ...(input.metadata !== undefined
        ? { metadata: input.metadata as Prisma.InputJsonValue }
        : {}),
    };
    await this.prisma.auditLog.create({ data });
  }
}
