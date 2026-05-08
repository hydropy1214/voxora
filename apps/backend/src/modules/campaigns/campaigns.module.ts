import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignProcessor } from './campaign.processor';
import { WebsocketGateway } from '../../gateways/websocket.gateway';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'campaign' }),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignProcessor, WebsocketGateway],
  exports: [CampaignsService],
})
export class CampaignsModule {}
