import { Module, Global } from '@nestjs/common';
import { SipService } from './sip.service';
import { FreeswitchEslService } from './freeswitch-esl.service';
import { SipTestService } from './sip-test.service';

@Global()
@Module({
  providers: [SipService, FreeswitchEslService, SipTestService],
  exports: [SipService, FreeswitchEslService, SipTestService],
})
export class SipServiceModule {}
