import { Module } from '@nestjs/common';
import { LiveMonitorController } from './live-monitor.controller';
import { LiveMonitorService } from './live-monitor.service';

@Module({
  controllers: [LiveMonitorController],
  providers: [LiveMonitorService],
  exports: [LiveMonitorService],
})
export class LiveMonitorModule {}
