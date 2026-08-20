import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { UnauthorizedError, generateId } from '@cryptopay/shared';
import type { RefreshToken } from '@cryptopay/database';
import { PrismaService } from '../../database/prisma.service.js';
import { ENV, type Env } from '../../config/env.provider.js';
import { hashOpaqueToken } from './token-hash.util.js';

export interface IssuedRefreshToken {
  raw: string;
  record: RefreshToken;
}

export interface RefreshContext {
  userAgent?: string;
  ipAddress?: string;
}

const PURPOSE = 'refresh';

/**
 * Opaque, rotated refresh tokens (spec §31). Reuse of an already-rotated or
 * expired token is treated as theft: the entire rotation family is revoked,
 * forcing re-login rather than silently issuing a new token.
 */
@Injectable()
export class RefreshTokenService {
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
  ) {
    this.secret = env.JWT_REFRESH_SECRET;
    this.ttlSeconds = env.REFRESH_TOKEN_TTL_SECONDS;
  }

  private hash(raw: string): string {
    return hashOpaqueToken(raw, this.secret, PURPOSE);
  }

  private generateRaw(): string {
    return randomBytes(32).toString('base64url');
  }

  async issue(userId: string, ctx: RefreshContext & { familyId?: string }): Promise<IssuedRefreshToken> {
    const raw = this.generateRaw();
    const familyId = ctx.familyId ?? generateId('fam');
    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(raw),
        familyId,
        expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
        ...(ctx.userAgent !== undefined ? { userAgent: ctx.userAgent } : {}),
        ...(ctx.ipAddress !== undefined ? { ipAddress: ctx.ipAddress } : {}),
      },
    });
    return { raw, record };
  }

  async rotate(rawToken: string, ctx: RefreshContext): Promise<IssuedRefreshToken> {
    const tokenHash = this.hash(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (existing.revokedAt || existing.expiresAt < new Date()) {
      // Reuse of a revoked/rotated token, or an expired one — treat as a
      // compromised session and kill the whole rotation family.
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedError('Session has been revoked, please log in again');
    }

    const next = await this.issue(existing.userId, { familyId: existing.familyId, ...ctx });
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: next.record.id },
    });
    return next;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByRawToken(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  get ttl(): number {
    return this.ttlSeconds;
  }
}
