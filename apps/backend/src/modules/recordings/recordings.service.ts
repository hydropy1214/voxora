import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RecordingsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, page = 1, limit = 50, search?: string) {
    const campaignIds = await this.prisma.campaign.findMany({
      where: { userId },
      select: { id: true },
    }).then(c => c.map(c => c.id));

    const where: any = {
      callLogs: { some: { campaignId: { in: campaignIds } } },
    };

    if (search) {
      where.OR = [
        { callUuid: { contains: search } },
        { callLogs: { some: { phone: { contains: search } } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.recording.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          callLogs: {
            select: {
              phone: true, status: true, duration: true, campaignId: true,
              campaign: { select: { id: true, name: true } },
            },
            take: 1,
          },
        },
      }),
      this.prisma.recording.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(userId: string, id: string) {
    const recording = await this.prisma.recording.findFirst({
      where: { id },
      include: { callLogs: { include: { campaign: true } } },
    });

    if (!recording) throw new NotFoundException('Recording not found');

    // Verify access
    const hasAccess = recording.callLogs.some(l => l.campaign.userId === userId);
    if (!hasAccess) throw new NotFoundException('Recording not found');

    return recording;
  }

  async stream(userId: string, id: string) {
    const recording = await this.findOne(userId, id);

    if (!fs.existsSync(recording.storagePath)) {
      throw new NotFoundException('Recording file not found on disk');
    }

    const stat = fs.statSync(recording.storagePath);
    const fileStream = fs.createReadStream(recording.storagePath);

    return {
      stream: new StreamableFile(fileStream),
      size: stat.size,
      mimeType: recording.mimeType,
    };
  }

  async delete(userId: string, id: string) {
    const recording = await this.findOne(userId, id);

    try {
      if (fs.existsSync(recording.storagePath)) {
        await fs.promises.unlink(recording.storagePath);
      }
    } catch {}

    await this.prisma.recording.delete({ where: { id } });
    return { success: true };
  }
}
