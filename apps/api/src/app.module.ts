import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { RedisModule } from './redis/redis.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { CheckoutModule } from './checkout/checkout.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HealthController } from './health/health.controller.js';
import { AppExceptionFilter } from './common/errors/app-exception.filter.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    ApiKeysModule,
    InvoicesModule,
    PaymentsModule,
    WebhooksModule,
    CheckoutModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
})
export class AppModule {}
