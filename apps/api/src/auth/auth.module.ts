import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccessTokenService } from './tokens/access-token.service.js';
import { RefreshTokenService } from './tokens/refresh-token.service.js';
import { EmailVerificationService } from './tokens/email-verification.service.js';
import { TotpService } from './totp.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenService,
    RefreshTokenService,
    EmailVerificationService,
    TotpService,
  ],
  exports: [AccessTokenService, RefreshTokenService],
})
export class AuthModule {}
