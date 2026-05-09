import { Module } from '@nestjs/common';
import { DialerController } from './dialer.controller';
import { DialerService } from './dialer.service';

@Module({
  controllers: [DialerController],
  providers: [DialerService],
  exports: [DialerService],
})
export class DialerModule {}
