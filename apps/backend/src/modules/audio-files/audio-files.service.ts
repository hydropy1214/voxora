import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AudioFilesService {
  private readonly logger = new Logger(AudioFilesService.name);
  private readonly uploadPath: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.uploadPath = config.get('STORAGE_LOCAL_PATH', '/app/uploads');
    fs.mkdirSync(path.join(this.uploadPath, 'audio'), { recursive: true });
  }

  async upload(userId: string, file: Express.Multer.File, name?: string) {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    const storagePath = path.join(this.uploadPath, 'audio', filename);

    await fs.promises.writeFile(storagePath, file.buffer);

    const audioFile = await this.prisma.audioFile.create({
      data: {
        userId,
        name: name || path.basename(file.originalname, ext),
        originalName: file.originalname,
        filename,
        mimeType: file.mimetype,
        size: file.size,
        storageDriver: 'local',
        storagePath,
        status: 'PROCESSING',
        format: ext.replace('.', ''),
      },
    });

    // Process async (get duration, bitrate)
    this.processAudioFile(audioFile.id, storagePath, file.mimetype).catch(err =>
      this.logger.error(`Audio processing failed for ${audioFile.id}: ${err.message}`),
    );

    return audioFile;
  }

  private async processAudioFile(id: string, filePath: string, mimeType: string) {
    try {
      // Use ffprobe or basic header reading for duration
      const stats = fs.statSync(filePath);

      // Estimate duration from file size (simplified)
      // In production, use ffprobe: `ffprobe -i file -show_entries format=duration`
      const estimatedDuration = mimeType.includes('wav')
        ? Math.floor(stats.size / (44100 * 2 * 2)) // 44.1kHz 16-bit stereo
        : Math.floor(stats.size / 16000); // ~128kbps MP3 estimate

      await this.prisma.audioFile.update({
        where: { id },
        data: {
          duration: Math.max(1, estimatedDuration),
          status: 'READY',
          publicUrl: `/api/audio-files/${id}/stream`,
        },
      });
    } catch (err) {
      await this.prisma.audioFile.update({
        where: { id },
        data: { status: 'FAILED' },
      });
    }
  }

  async findAll(userId: string) {
    return this.prisma.audioFile.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const file = await this.prisma.audioFile.findFirst({ where: { id, userId } });
    if (!file) throw new NotFoundException('Audio file not found');
    return file;
  }

  async getStoragePath(id: string): Promise<string> {
    const file = await this.prisma.audioFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Audio file not found');
    return file.storagePath;
  }

  async remove(userId: string, id: string) {
    const file = await this.findOne(userId, id);

    try {
      if (fs.existsSync(file.storagePath)) {
        await fs.promises.unlink(file.storagePath);
      }
    } catch (err) {
      this.logger.warn(`Could not delete audio file: ${err.message}`);
    }

    await this.prisma.audioFile.delete({ where: { id } });
    return { success: true };
  }
}
