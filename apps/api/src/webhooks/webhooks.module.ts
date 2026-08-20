import { Module } from '@nestjs/common';
import { WebhookEndpointsController } from './webhook-endpoints.controller.js';
import { WebhookEndpointsService } from './webhook-endpoints.service.js';

@Module({
  controllers: [WebhookEndpointsController],
  providers: [WebhookEndpointsService],
  exports: [WebhookEndpointsService],
})
export class WebhooksModule {}
