-- DropIndex
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_payment_address_key";

-- CreateTable
CREATE TABLE "merchant_wallet_addresses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_wallet_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_scan_cursors" (
    "network" TEXT NOT NULL,
    "last_scanned_block" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blockchain_scan_cursors_pkey" PRIMARY KEY ("network")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_wallet_addresses_organization_id_network_token_key" ON "merchant_wallet_addresses"("organization_id", "network", "token");

-- CreateIndex
CREATE INDEX "invoices_payment_address_status_idx" ON "invoices"("payment_address", "status");

-- AddForeignKey
ALTER TABLE "merchant_wallet_addresses" ADD CONSTRAINT "merchant_wallet_addresses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
