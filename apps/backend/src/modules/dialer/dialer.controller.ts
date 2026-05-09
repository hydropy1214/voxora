import {
  Controller, Post, Get, Body, Param, UseGuards, Request,
  Query, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DialerService } from './dialer.service';
import { InitiateCallDto, HangupCallDto } from './dto/dialer.dto';

@ApiTags('Dialer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dialer')
export class DialerController {
  constructor(private service: DialerService) {}

  @Post('call')
  @ApiOperation({ summary: 'Initiate an outbound call through the dialer' })
  initiateCall(@Request() req: any, @Body() dto: InitiateCallDto) {
    return this.service.initiateCall(req.user.id, dto);
  }

  @Post('hangup')
  @ApiOperation({ summary: 'Hang up an active dialer call' })
  hangupCall(@Request() req: any, @Body() dto: HangupCallDto) {
    return this.service.hangupCall(req.user.id, dto.callId);
  }

  @Get('active')
  @ApiOperation({ summary: 'List currently active dialer calls for this user' })
  getActiveCalls(@Request() req: any) {
    return this.service.getActiveCalls(req.user.id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Dialer call history (most recent first)' })
  getHistory(
    @Request() req: any,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.service.getCallHistory(req.user.id, limit);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Dialer call statistics (last 30 days)' })
  getStats(@Request() req: any) {
    return this.service.getStats(req.user.id);
  }
}
