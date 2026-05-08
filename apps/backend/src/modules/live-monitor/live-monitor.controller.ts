import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LiveMonitorService } from './live-monitor.service';

@ApiTags('Live Monitor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('live-monitor')
export class LiveMonitorController {
  constructor(private service: LiveMonitorService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get live stats' })
  getLiveStats(@Req() req) {
    return this.service.getLiveStats(req.user.id);
  }

  @Get('sip-logs')
  @ApiOperation({ summary: 'Get recent SIP logs' })
  getSipLogs(@Req() req, @Query('limit') limit = 50) {
    return this.service.getSipLogs(req.user.id, +limit);
  }

  @Get('rtp')
  @ApiOperation({ summary: 'Get RTP metrics' })
  getRtpMetrics(@Req() req) {
    return this.service.getRtpMetrics(req.user.id);
  }
}
