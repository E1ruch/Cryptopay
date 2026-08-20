import { randomBytes } from 'node:crypto';
import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  verifyTotpSchema,
  type RegisterInput,
  type LoginInput,
  type VerifyEmailInput,
  type VerifyTotpInput,
} from '@cryptopay/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { CsrfGuard } from '../common/guards/csrf.guard.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { RedisRateLimitGuard } from '../common/guards/redis-rate-limit.guard.js';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator.js';
import { extractRequestContext } from '../common/request-context.util.js';
import { ENV, type Env } from '../config/env.provider.js';
import { AuthService } from './auth.service.js';
import { setAuthCookies, clearAuthCookies } from './cookies.util.js';

@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly authService: AuthService,
  ) {}

  @Post('register')
  @HttpCode(202)
  @UseGuards(RedisRateLimitGuard)
  @RateLimit('global')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() request: FastifyRequest,
  ): Promise<{ status: 'ok'; message: string }> {
    await this.authService.register(body, extractRequestContext(request));
    return {
      status: 'ok',
      message: 'If this email is not already registered, a verification email has been sent.',
    };
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(RedisRateLimitGuard)
  @RateLimit('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ status: 'ok' }> {
    const tokens = await this.authService.login(body, extractRequestContext(request));
    this.issueCookies(reply, tokens);
    return { status: 'ok' };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ status: 'ok' }> {
    const rawRefreshToken = request.cookies?.cp_rt;
    if (!rawRefreshToken) {
      clearAuthCookies(reply);
      return { status: 'ok' };
    }
    const tokens = await this.authService.refresh(rawRefreshToken, extractRequestContext(request));
    this.issueCookies(reply, tokens);
    return { status: 'ok' };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ status: 'ok' }> {
    await this.authService.logout(request.cookies?.cp_rt);
    clearAuthCookies(reply);
    return { status: 'ok' };
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
  ): Promise<{ status: 'ok' }> {
    await this.authService.verifyEmail(body.token);
    return { status: 'ok' };
  }

  @Post('2fa/enable')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfGuard)
  async enableTwoFactor(
    @CurrentUserId() userId: string,
  ): Promise<{ secretBase32: string; otpauthUrl: string }> {
    return this.authService.enableTwoFactor(userId);
  }

  @Post('2fa/verify')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfGuard)
  async verifyTwoFactor(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(verifyTotpSchema)) body: VerifyTotpInput,
  ): Promise<{ status: 'ok' }> {
    await this.authService.confirmTwoFactor(userId, body.code);
    return { status: 'ok' };
  }

  private issueCookies(
    reply: FastifyReply,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    setAuthCookies(
      reply,
      {
        secure: this.env.COOKIE_SECURE,
        accessTtlSeconds: this.env.ACCESS_TOKEN_TTL_SECONDS,
        refreshTtlSeconds: this.env.REFRESH_TOKEN_TTL_SECONDS,
      },
      { ...tokens, csrfToken: randomBytes(24).toString('hex') },
    );
  }
}
