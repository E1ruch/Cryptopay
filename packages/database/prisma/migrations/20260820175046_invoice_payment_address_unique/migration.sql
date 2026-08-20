-- AlterTable
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_address_key" UNIQUE ("payment_address");
