import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard stats' })
  getDashboard(@Req() req) {
    return this.service.getDashboardStats(req.user.id);
  }

  @Get('timeline')
  @ApiOperation({ summary: 'Get calls timeline' })
  getTimeline(@Req() req, @Query('days') days = 30) {
    return this.service.getCallsTimeline(req.user.id, +days);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Get campaign performance' })
  getCampaigns(@Req() req) {
    return this.service.getCampaignPerformance(req.user.id);
  }

  @Get('rtp')
  @ApiOperation({ summary: 'Get RTP quality stats' })
  getRtp(@Req() req) {
    return this.service.getRtpStats(req.user.id);
  }

  @Get('events')
  @ApiOperation({ summary: 'Get recent events' })
  getEvents(@Req() req, @Query('limit') limit = 10) {
    return this.service.getRecentEvents(req.user.id, +limit);
  }

  @Get('range')
  @ApiOperation({ summary: 'Get analytics for a custom date range' })
  getRange(
    @Req() req,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') groupBy: 'day' | 'week' | 'month' = 'day',
  ) {
    return this.service.getRangeStats(req.user.id, from, to, groupBy);
  }

  @Get('reports/campaigns')
  @ApiOperation({ summary: 'Campaign report for date range (CSV-ready)' })
  getCampaignReport(
    @Req() req,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getCampaignReport(req.user.id, from, to);
  }

  @Get('reports/dialer')
  @ApiOperation({ summary: 'Dialer call report for date range' })
  getDialerReport(
    @Req() req,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getDialerReport(req.user.id, from, to);
  }

  @Get('reports/contacts')
  @ApiOperation({ summary: 'Contact list report' })
  getContactReport(@Req() req) {
    return this.service.getContactReport(req.user.id);
  }
}
