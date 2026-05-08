import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param,
  UseGuards, Req, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@ApiTags('Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private service: CampaignsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a campaign' })
  create(@Req() req, @Body() dto: CreateCampaignDto) {
    return this.service.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List campaigns' })
  findAll(@Req() req, @Query('page') page = 1, @Query('limit') limit = 20) {
    return this.service.findAll(req.user.id, +page, +limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a campaign' })
  findOne(@Req() req, @Param('id') id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get campaign stats' })
  getStats(@Req() req, @Param('id') id: string) {
    return this.service.getStats(req.user.id, id);
  }

  @Get(':id/live-calls')
  @ApiOperation({ summary: 'Get live calls for a campaign' })
  getLiveCalls(@Param('id') id: string) {
    return this.service.getLiveCalls(id);
  }

  @Get(':id/call-logs')
  @ApiOperation({ summary: 'Get call logs for a campaign' })
  getCallLogs(
    @Req() req,
    @Param('id') id: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.service.getCallLogs(req.user.id, id, +page, +limit);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a campaign' })
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.service.update(req.user.id, id, dto);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start a campaign' })
  start(@Req() req, @Param('id') id: string) {
    return this.service.start(req.user.id, id);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause a campaign' })
  pause(@Req() req, @Param('id') id: string) {
    return this.service.pause(req.user.id, id);
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop a campaign' })
  stop(@Req() req, @Param('id') id: string) {
    return this.service.stop(req.user.id, id);
  }
}
