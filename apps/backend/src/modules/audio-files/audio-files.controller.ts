import {
  Controller, Get, Post, Delete, Param, UseGuards, Req,
  UseInterceptors, UploadedFile, Body, Res, StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AudioFilesService } from './audio-files.service';
import type { Response } from 'express';
import * as fs from 'fs';

@ApiTags('Audio Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audio-files')
export class AudioFilesController {
  constructor(private service: AudioFilesService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload an audio file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string },
  ) {
    return this.service.upload(req.user.id, file, body.name);
  }

  @Get()
  @ApiOperation({ summary: 'List audio files' })
  findAll(@Req() req) {
    return this.service.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an audio file' })
  findOne(@Req() req, @Param('id') id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Get(':id/stream')
  @ApiOperation({ summary: 'Stream an audio file' })
  async stream(@Req() req, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const filePath = await this.service.getStoragePath(id);
    const stat = fs.statSync(filePath);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
    });
    const fileStream = fs.createReadStream(filePath);
    return new StreamableFile(fileStream);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an audio file' })
  remove(@Req() req, @Param('id') id: string) {
    return this.service.remove(req.user.id, id);
  }
}
