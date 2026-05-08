import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { SipService } from '../../services/sip/sip.service';

interface CampaignJob {
  campaignId: string;
  userId: string;
}

@Processor('campaign')
export class CampaignProcessor {
  private readonly logger = new Logger(CampaignProcessor.name);
  private readonly activeWorkers = new Map<string, boolean>();

  constructor(
    private prisma: PrismaService,
    private sipService: SipService,
    private eventEmitter: EventEmitter2,
  ) {}

  @Process('start')
  async handleStart(job: Job<CampaignJob>) {
    const { campaignId } = job.data;
    this.logger.log(`Starting campaign ${campaignId}`);

    this.activeWorkers.set(campaignId, true);

    try {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { sipAccount: true, audioFile: true, voicemailAudio: true },
      });

      if (!campaign || campaign.status !== 'RUNNING') return;

      // Get contacts to dial
      const contacts = await this.prisma.contact.findMany({
        where: {
          listId: campaign.contactListId,
          isValid: true,
          isDuplicate: false,
          isOptedOut: false,
        },
        orderBy: { createdAt: 'asc' },
      });

      this.logger.log(`Campaign ${campaignId}: ${contacts.length} contacts to dial`);

      const maxConcurrent = campaign.maxConcurrentCalls;
      const cps = campaign.callsPerSecond;
      const delayBetweenCalls = Math.floor(1000 / cps);

      let activeCallCount = 0;
      const callPromises: Promise<void>[] = [];

      for (const contact of contacts) {
        // Check if campaign is still running
        if (!this.activeWorkers.get(campaignId)) {
          this.logger.log(`Campaign ${campaignId} stopped by worker flag`);
          break;
        }

        const freshCampaign = await this.prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { status: true },
        });

        if (freshCampaign?.status !== 'RUNNING') {
          this.logger.log(`Campaign ${campaignId} stopped: status=${freshCampaign?.status}`);
          break;
        }

        // Wait if at max concurrency
        while (activeCallCount >= maxConcurrent) {
          await this.sleep(100);
          const liveCalls = await this.prisma.callLog.count({
            where: { campaignId, status: { in: ['DIALING', 'RINGING', 'ANSWERED'] } },
          });
          activeCallCount = liveCalls;
        }

        // Place the call
        activeCallCount++;
        const callPromise = this.placeCall(campaign, contact, campaignId)
          .then(() => { activeCallCount = Math.max(0, activeCallCount - 1); })
          .catch(err => {
            activeCallCount = Math.max(0, activeCallCount - 1);
            this.logger.error(`Call failed for ${contact.phone}: ${err.message}`);
          });

        callPromises.push(callPromise);

        // Rate limiting
        await this.sleep(delayBetweenCalls);
      }

      // Wait for remaining calls
      await Promise.allSettled(callPromises);

      // Mark campaign complete
      const finalStatus = this.activeWorkers.get(campaignId) ? 'COMPLETED' : 'CANCELLED';
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: finalStatus as any,
          completedAt: new Date(),
          activeCalls: 0,
        },
      });

      this.eventEmitter.emit('campaign.completed', { campaignId, status: finalStatus });
      this.logger.log(`Campaign ${campaignId} ${finalStatus}`);

    } finally {
      this.activeWorkers.delete(campaignId);
    }
  }

  @Process('pause')
  async handlePause(job: Job<{ campaignId: string }>) {
    this.activeWorkers.set(job.data.campaignId, false);
    this.logger.log(`Campaign ${job.data.campaignId} paused`);
  }

  @Process('stop')
  async handleStop(job: Job<{ campaignId: string }>) {
    this.activeWorkers.set(job.data.campaignId, false);
    this.logger.log(`Campaign ${job.data.campaignId} stopped`);
  }

  private async placeCall(campaign: any, contact: any, campaignId: string) {
    const phone = contact.formattedPhone || contact.phone;

    // Create call log
    const callLog = await this.prisma.callLog.create({
      data: {
        campaignId,
        contactId: contact.id,
        phone,
        direction: 'outbound',
        status: 'DIALING',
        uuid: `pending-${contact.id}`,
      },
    });

    try {
      // Execute call via FreeSWITCH ESL
      const result = await this.sipService.originate({
        destination: phone,
        gateway: campaign.sipAccount.username + '@' + campaign.sipAccount.sipServer,
        callerIdNumber: campaign.callerIdNumber || campaign.sipAccount.callerIdNumber,
        callerIdName: campaign.callerIdName || campaign.sipAccount.callerIdName,
        audioFile: campaign.audioFile.storagePath,
        voicemailAudio: campaign.voicemailAudio?.storagePath,
        campaignId,
        amdEnabled: campaign.amdEnabled,
        amdAction: campaign.amdAction,
        timeout: 60,
      });

      // Update call log with UUID
      await this.prisma.callLog.update({
        where: { id: callLog.id },
        data: { uuid: result.uuid || callLog.uuid },
      });

      // Update campaign counters
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          processedContacts: { increment: 1 },
          activeCalls: { increment: 1 },
        },
      });

    } catch (err) {
      await this.prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          status: 'FAILED',
          hangupCause: err.message,
          hangupAt: new Date(),
        },
      });

      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          processedContacts: { increment: 1 },
          failedCalls: { increment: 1 },
        },
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
