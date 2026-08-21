import { Module } from '@nestjs/common';
import { WalletAddressesModule } from '../wallet-addresses/wallet-addresses.module.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';

@Module({
  imports: [WalletAddressesModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
