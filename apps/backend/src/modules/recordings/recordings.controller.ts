import {
  Controller, Get, Delete, Param, UseGuards, Req, Query, Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecordingsService } from './recordings.service';
import type { Response } from 'express';

@ApiTags('Recordings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recordings')
export class RecordingsController {
  constructor(private service: RecordingsService) {}

  @Get()
  @ApiOperation({ summary: 'List recordings' })
  findAll(
    @Req() req,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(req.user.id, +page, +limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a recording' })
  findOne(@Req() req, @Param('id') id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Get(':id/stream')
  @ApiOperation({ summary: 'Stream a recording' })
  async stream(@Req() req, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { stream, size, mimeType } = await this.service.stream(req.user.id, id);
    res.set({
      'Content-Type': mimeType,
      'Content-Length': size,
      'Accept-Ranges': 'bytes',
    });
    return stream;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a recording' })
  delete(@Req() req, @Param('id') id: string) {
    return this.service.delete(req.user.id, id);
  }
}
