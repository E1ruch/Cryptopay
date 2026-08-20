import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  hashPassword,
  verifyPassword,
  encryptSecret,
  decryptSecret,
  type Argon2Params,
} from '@cryptopay/crypto';
import { InternalError, UnauthorizedError, ValidationError } from '@cryptopay/shared';
import type { LoginInput, RegisterInput } from '@cryptopay/validation';
import type { User } from '@cryptopay/database';
import { PrismaService } from '../database/prisma.service.js';
import { ENV, type Env } from '../config/env.provider.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../common/request-context.util.js';
import { AccessTokenService } from './tokens/access-token.service.js';
import { RefreshTokenService } from './tokens/refresh-token.service.js';
import { EmailVerificationService } from './tokens/email-verification.service.js';
import { TotpService } from './totp.service.js';

const FAILED_LOGIN_LOCK_THRESHOLD = 5;
const FAILED_LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly argon2Params: Argon2Params;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly emailVerification: EmailVerificationService,
    private readonly totp: TotpService,
    private readonly audit: AuditService,
  ) {
    this.argon2Params = {
      memoryCostKib: env.ARGON2_MEMORY_COST_KIB,
      timeCost: env.ARGON2_TIME_COST,
      parallelism: env.ARGON2_PARALLELISM,
    };
  }

  /**
   * Always responds the same way regardless of whether the email is already
   * registered, to avoid leaking account existence (user enumeration).
   */
  async register(input: RegisterInput, ctx: RequestContext): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      this.logger.debug('Registration attempted for an existing email — no-op');
      return;
    }

    const passwordHash = await hashPassword(input.password, this.argon2Params);
    const user = await this.prisma.user.create({ data: { email: input.email, passwordHash } });

    const verificationToken = await this.emailVerification.issue(user.id);
    // Phase 0 has no email provider integration yet — log instead of sending.
    this.logger.log(
      `Verification token issued for ${user.id} (dev mode, no email delivery yet): ${verificationToken}`,
    );

    await this.audit.record({
      actorId: user.id,
      actorType: 'user',
      action: 'user.register',
      resourceType: 'user',
      resourceId: user.id,
      ...ctx,
    });
  }

  async verifyEmail(rawToken: string): Promise<void> {
    await this.emailVerification.consume(rawToken);
  }

  async login(input: LoginInput, ctx: RequestContext): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedError('Account is suspended');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedError('Account temporarily locked due to repeated failed logins');
    }

    const validPassword = await verifyPassword(user.passwordHash, input.password);
    if (!validPassword) {
      await this.registerFailedLogin(user);
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedError('Please verify your email before logging in');
    }

    if (user.twoFactorEnabled) {
      if (!input.totpCode) {
        throw new UnauthorizedError('Two-factor authentication code required');
      }
      if (!user.twoFactorSecretEnc) {
        throw new InternalError('Two-factor is enabled but no secret is configured');
      }
      const secret = decryptSecret(user.twoFactorSecretEnc, this.env.ENCRYPTION_KEY);
      if (!this.totp.verify(secret, input.totpCode)) {
        await this.registerFailedLogin(user);
        throw new UnauthorizedError('Invalid two-factor code');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: 'ACTIVE',
        lastLoginAt: new Date(),
      },
    });

    const accessToken = await this.accessTokens.sign(user.id);
    const { raw: refreshToken } = await this.refreshTokens.issue(user.id, {
      ...(ctx.userAgent !== undefined ? { userAgent: ctx.userAgent } : {}),
      ipAddress: ctx.ip,
    });

    await this.audit.record({
      actorId: user.id,
      actorType: 'user',
      action: 'user.login',
      resourceType: 'user',
      resourceId: user.id,
      ...ctx,
    });

    return { accessToken, refreshToken };
  }

  async refresh(rawRefreshToken: string, ctx: RequestContext): Promise<AuthTokens> {
    const { raw, record } = await this.refreshTokens.rotate(rawRefreshToken, {
      ...(ctx.userAgent !== undefined ? { userAgent: ctx.userAgent } : {}),
      ipAddress: ctx.ip,
    });
    const accessToken = await this.accessTokens.sign(record.userId);
    return { accessToken, refreshToken: raw };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) {
      await this.refreshTokens.revokeByRawToken(rawRefreshToken);
    }
  }

  async enableTwoFactor(userId: string): Promise<{ secretBase32: string; otpauthUrl: string }> {
    const user = await this.requireUser(userId);
    const { secretBase32, otpauthUrl } = this.totp.generateSecret(user.email);
    const encrypted = encryptSecret(secretBase32, this.env.ENCRYPTION_KEY);
    // twoFactorEnabled stays false until confirmTwoFactor — an unconfirmed
    // secret must never be able to lock the user out of their own account.
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecretEnc: encrypted, twoFactorEnabled: false },
    });
    return { secretBase32, otpauthUrl };
  }

  async confirmTwoFactor(userId: string, code: string): Promise<void> {
    const user = await this.requireUser(userId);
    if (!user.twoFactorSecretEnc) {
      throw new ValidationError('Two-factor setup was not started');
    }
    const secret = decryptSecret(user.twoFactorSecretEnc, this.env.ENCRYPTION_KEY);
    if (!this.totp.verify(secret, code)) {
      throw new ValidationError('Invalid two-factor code');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedError('User not found');
    }
    return user;
  }

  private async registerFailedLogin(user: User): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        ...(attempts >= FAILED_LOGIN_LOCK_THRESHOLD
          ? {
              lockedUntil: new Date(Date.now() + FAILED_LOGIN_LOCK_DURATION_MS),
              status: 'LOCKED' as const,
            }
          : {}),
      },
    });
  }
}
