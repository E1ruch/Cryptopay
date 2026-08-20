import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { DashboardInvoicesController } from './dashboard-invoices.controller.js';
import { DashboardWebhooksController } from './dashboard-webhooks.controller.js';

@Module({
  imports: [AuthModule, InvoicesModule, WebhooksModule],
  controllers: [DashboardInvoicesController, DashboardWebhooksController],
})
export class DashboardModule {}
