import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ValidationError } from '@cryptopay/shared';
import { PrismaService } from '../../database/prisma.service.js';
import { ENV, type Env } from '../../config/env.provider.js';
import { hashOpaqueToken } from './token-hash.util.js';

const PURPOSE = 'email_verification';
const TTL_HOURS = 24;

@Injectable()
export class EmailVerificationService {
  private readonly secret: string;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
  ) {
    this.secret = env.JWT_REFRESH_SECRET;
  }

  private hash(raw: string): string {
    return hashOpaqueToken(raw, this.secret, PURPOSE);
  }

  async issue(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: this.hash(raw),
        expiresAt: new Date(Date.now() + TTL_HOURS * 3_600_000),
      },
    });
    return raw;
  }

  async consume(rawToken: string): Promise<{ userId: string }> {
    const tokenHash = this.hash(rawToken);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      throw new ValidationError('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
      }),
    ]);

    return { userId: record.userId };
  }
}
