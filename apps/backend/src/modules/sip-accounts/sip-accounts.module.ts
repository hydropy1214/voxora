import { Module } from '@nestjs/common';
import { SipAccountsController } from './sip-accounts.controller';
import { SipAccountsService } from './sip-accounts.service';

@Module({
  controllers: [SipAccountsController],
  providers: [SipAccountsService],
  exports: [SipAccountsService],
})
export class SipAccountsModule {}
