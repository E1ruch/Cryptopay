import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BlockchainModule } from '../blockchain/blockchain.module.js';
import { WalletAddressesController } from './wallet-addresses.controller.js';
import { WalletAddressesService } from './wallet-addresses.service.js';

@Module({
  imports: [AuthModule, BlockchainModule],
  controllers: [WalletAddressesController],
  providers: [WalletAddressesService],
  exports: [WalletAddressesService],
})
export class WalletAddressesModule {}
