import { Module, Global } from '@nestjs/common';
import { SipService } from './sip.service';
import { FreeswitchEslService } from './freeswitch-esl.service';
import { SipTestService } from './sip-test.service';
import { GatewayManagerService } from './gateway-manager.service';

@Global()
@Module({
  providers: [
    FreeswitchEslService,
    GatewayManagerService,
    SipService,
    SipTestService,
  ],
  exports: [
    FreeswitchEslService,
    GatewayManagerService,
    SipService,
    SipTestService,
  ],
})
export class SipServiceModule {}
