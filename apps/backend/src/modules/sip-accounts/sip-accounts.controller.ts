import {
  Controller, Get, Post, Put, Delete, Body, Param,
  UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SipAccountsService } from './sip-accounts.service';
import { SipTestService } from '../../services/sip/sip-test.service';
import { CreateSipAccountDto } from './dto/create-sip-account.dto';
import { UpdateSipAccountDto } from './dto/update-sip-account.dto';

@ApiTags('SIP Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sip-accounts')
export class SipAccountsController {
  constructor(
    private service: SipAccountsService,
    private sipTestService: SipTestService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Add a SIP account' })
  create(@Req() req, @Body() dto: CreateSipAccountDto) {
    return this.service.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List SIP accounts' })
  findAll(@Req() req) {
    return this.service.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a SIP account' })
  findOne(@Req() req, @Param('id') id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a SIP account' })
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateSipAccountDto) {
    return this.service.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a SIP account' })
  remove(@Req() req, @Param('id') id: string) {
    return this.service.remove(req.user.id, id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test SIP connection' })
  test(@Req() req, @Param('id') id: string) {
    return this.sipTestService.testSipAccount(id);
  }

  @Post(':id/test-rtp')
  @ApiOperation({ summary: 'Test RTP quality' })
  testRtp(@Req() req, @Param('id') id: string) {
    return this.sipTestService.testRtp(id);
  }
}
