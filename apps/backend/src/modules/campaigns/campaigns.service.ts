import {
  Injectable, NotFoundException, BadRequestException,
  ConflictException, Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('campaign') private campaignQueue: Queue,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateCampaignDto) {
    // Verify all related resources belong to the user
    const [sipAccount, contactList, audioFile] = await Promise.all([
      this.prisma.sipAccount.findFirst({ where: { id: dto.sipAccountId, userId } }),
      this.prisma.contactList.findFirst({ where: { id: dto.contactListId, userId } }),
      this.prisma.audioFile.findFirst({ where: { id: dto.audioFileId, userId } }),
    ]);

    if (!sipAccount) throw new NotFoundException('SIP account not found');
    if (!contactList) throw new NotFoundException('Contact list not found');
    if (!audioFile) throw new NotFoundException('Audio file not found');

    return this.prisma.campaign.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        type: (dto.type ?? 'BROADCAST') as any,
        sipAccountId: dto.sipAccountId,
        contactListId: dto.contactListId,
        audioFileId: dto.audioFileId,
        voicemailAudioId: dto.voicemailAudioId,
        maxConcurrentCalls: dto.maxConcurrentCalls ?? 5,
        callsPerSecond: dto.callsPerSecond ?? 1.0,
        retryAttempts: dto.retryAttempts ?? 0,
        retryDelay: dto.retryDelay ?? 300,
        amdEnabled: dto.amdEnabled ?? true,
        amdAction: (dto.amdAction ?? 'PLAY_ON_HUMAN') as any,
        callerIdNumber: dto.callerIdNumber,
        callerIdName: dto.callerIdName,
        scheduledAt: dto.scheduledAt,
        totalContacts: contactList.validCount,
      },
      include: { sipAccount: true, contactList: true, audioFile: true },
    });
  }

  async findAll(userId: string, page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { userId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sipAccount: { select: { id: true, name: true, status: true } },
          contactList: { select: { id: true, name: true, totalCount: true } },
          audioFile: { select: { id: true, name: true, duration: true } },
        },
      }),
      this.prisma.campaign.count({ where: { userId } }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(userId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, userId },
      include: {
        sipAccount: true,
        contactList: true,
        audioFile: true,
        voicemailAudio: true,
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async update(userId: string, id: string, dto: UpdateCampaignDto) {
    await this.findOne(userId, id);
    return this.prisma.campaign.update({ where: { id }, data: dto as any });
  }

  async start(userId: string, id: string) {
    const campaign = await this.findOne(userId, id);

    if (!['DRAFT', 'PAUSED', 'SCHEDULED'].includes(campaign.status)) {
      throw new ConflictException(`Campaign cannot be started from status: ${campaign.status}`);
    }

    await this.prisma.campaign.update({
      where: { id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    // Enqueue campaign
    await this.campaignQueue.add('start', { campaignId: id, userId }, {
      priority: 1,
      removeOnComplete: true,
    });

    this.eventEmitter.emit('campaign.started', { campaignId: id, userId });
    this.logger.log(`Campaign ${id} started`);
    return { success: true, status: 'RUNNING' };
  }

  async pause(userId: string, id: string) {
    const campaign = await this.findOne(userId, id);
    if (campaign.status !== 'RUNNING') throw new ConflictException('Campaign is not running');

    await this.prisma.campaign.update({
      where: { id },
      data: { status: 'PAUSED', pausedAt: new Date() },
    });

    await this.campaignQueue.add('pause', { campaignId: id }, { priority: 0 });
    this.eventEmitter.emit('campaign.paused', { campaignId: id });
    return { success: true, status: 'PAUSED' };
  }

  async stop(userId: string, id: string) {
    const campaign = await this.findOne(userId, id);
    if (!['RUNNING', 'PAUSED'].includes(campaign.status)) {
      throw new ConflictException('Campaign is not active');
    }

    await this.prisma.campaign.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    await this.campaignQueue.add('stop', { campaignId: id }, { priority: 0 });
    this.eventEmitter.emit('campaign.stopped', { campaignId: id });
    return { success: true, status: 'CANCELLED' };
  }

  async getStats(userId: string, id: string) {
    const campaign = await this.findOne(userId, id);
    const recentCalls = await this.prisma.callLog.findMany({
      where: { campaignId: id },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...campaign,
      recentCalls,
      completionRate: campaign.totalContacts > 0
        ? (campaign.processedContacts / campaign.totalContacts) * 100
        : 0,
      answerRate: campaign.processedContacts > 0
        ? (campaign.answeredCalls / campaign.processedContacts) * 100
        : 0,
      humanRate: campaign.answeredCalls > 0
        ? (campaign.humanAnswers / campaign.answeredCalls) * 100
        : 0,
    };
  }

  async getLiveCalls(campaignId: string) {
    return this.prisma.callLog.findMany({
      where: { campaignId, status: { in: ['DIALING', 'RINGING', 'ANSWERED'] } },
      include: { contact: { select: { phone: true, firstName: true, lastName: true } } },
    });
  }

  async getCallLogs(userId: string, campaignId: string, page = 1, limit = 50) {
    await this.findOne(userId, campaignId);

    const [data, total] = await Promise.all([
      this.prisma.callLog.findMany({
        where: { campaignId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { contact: { select: { phone: true, firstName: true, lastName: true } } },
      }),
      this.prisma.callLog.count({ where: { campaignId } }),
    ]);

    return { data, total, page, pages: Math.ceil(total / limit) };
  }
}
