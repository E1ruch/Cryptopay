-- AlterTable
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_event_id_endpoint_id_key" UNIQUE ("event_id", "endpoint_id");
