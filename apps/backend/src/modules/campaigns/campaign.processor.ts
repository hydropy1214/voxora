import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { FreeswitchEslService } from '../../services/sip/freeswitch-esl.service';
import { GatewayManagerService } from '../../services/sip/gateway-manager.service';
import { WebsocketGateway } from '../../gateways/websocket.gateway';
import * as path from 'path';

interface CampaignJob {
  campaignId: string;
  userId: string;
}

/**
 * Campaign Processor
 *
 * BullMQ worker that drives the outbound call loop:
 *   1. Fetch campaign + contacts from DB
 *   2. Verify SIP gateway is registered with FreeSWITCH
 *   3. Dial each contact via ESL originate()
 *   4. Respect maxConcurrentCalls + callsPerSecond limits
 *   5. Update campaign stats in real time
 *   6. Broadcast progress via WebSocket
 *
 * Audio path note:
 *   Backend stores files at /app/uploads/audio/<uuid>.mp3
 *   FreeSWITCH reads from the SAME path (shared Docker volume callspsy_uploads)
 *   So the storagePath from the DB is directly usable in the ESL originate command.
 */
@Processor('campaign')
export class CampaignProcessor {
  private readonly logger = new Logger(CampaignProcessor.name);

  // Track which campaigns are actively running so we can stop them
  private readonly runningCampaigns = new Map<string, boolean>();

  constructor(
    private prisma: PrismaService,
    private esl: FreeswitchEslService,
    private gatewayManager: GatewayManagerService,
    private eventEmitter: EventEmitter2,
    private wsGateway: WebsocketGateway,
  ) {}

  // ── Job handlers ──────────────────────────────────────────────────────────

  @Process('start')
  async handleStart(job: Job<CampaignJob>) {
    const { campaignId, userId } = job.data;
    this.logger.log(`Campaign ${campaignId} — start job received`);

    this.runningCampaigns.set(campaignId, true);

    try {
      await this.runCampaign(campaignId, userId);
    } catch (err: any) {
      this.logger.error(`Campaign ${campaignId} crashed: ${err.message}`);
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'FAILED', completedAt: new Date() },
      });
      this.eventEmitter.emit('campaign.failed', { campaignId, error: err.message });
    } finally {
      this.runningCampaigns.delete(campaignId);
    }
  }

  @Process('pause')
  async handlePause(job: Job<{ campaignId: string }>) {
    this.runningCampaigns.set(job.data.campaignId, false);
    this.logger.log(`Campaign ${job.data.campaignId} — pause signal received`);
  }

  @Process('stop')
  async handleStop(job: Job<{ campaignId: string }>) {
    this.runningCampaigns.set(job.data.campaignId, false);
    this.logger.log(`Campaign ${job.data.campaignId} — stop signal received`);
  }

  // ── Core campaign execution loop ──────────────────────────────────────────

  private async runCampaign(campaignId: string, userId: string) {
    // 1. Load campaign with all related data
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        sipAccount:     true,
        audioFile:      true,
        voicemailAudio: true,
      },
    });

    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
    if (campaign.status !== 'RUNNING') {
      this.logger.warn(`Campaign ${campaignId} is ${campaign.status}, aborting`);
      return;
    }

    // 2. Verify ESL is connected — campaigns REQUIRE FreeSWITCH
    if (!this.esl.isConnected()) {
      throw new Error(
        'FreeSWITCH ESL is not connected. ' +
        'Start FreeSWITCH first: docker compose up -d freeswitch',
      );
    }

    // 3. Verify the SIP gateway is registered (wait up to 60s)
    const gwStatus = await this.gatewayManager.getStatus(campaign.sipAccountId);
    if (gwStatus !== 'REGISTERED') {
      this.logger.warn(`Gateway ${campaign.sipAccountId} status=${gwStatus} — waiting up to 60s...`);
      let waited = 0;
      let registered = false;
      while (waited < 60000) {
        await this.sleep(3000);
        waited += 3000;
        const s = await this.gatewayManager.getStatus(campaign.sipAccountId);
        if (s === 'REGISTERED') { registered = true; break; }
        this.logger.debug(`Gateway ${campaign.sipAccountId}: status=${s} (${waited}ms elapsed)`);
      }
      if (!registered) {
        const finalStatus = await this.gatewayManager.getStatus(campaign.sipAccountId);
        throw new Error(
          `SIP gateway not registered after 60s (status=${finalStatus}). ` +
          'Check SIP account credentials and server connectivity.',
        );
      }
    }
    this.logger.log(`Campaign ${campaignId}: gateway registered ✓`);

    // 4. Load contacts to dial
    const contacts = await this.prisma.contact.findMany({
      where: {
        listId:      campaign.contactListId,
        isValid:     true,
        isDuplicate: false,
        isOptedOut:  false,
      },
      orderBy: { createdAt: 'asc' },
    });

    const total = contacts.length;
    this.logger.log(`Campaign ${campaignId}: ${total} valid contacts to dial`);

    if (total === 0) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      return;
    }

    // 5. Dial loop
    const maxConcurrent = campaign.maxConcurrentCalls;
    const cps           = campaign.callsPerSecond > 0 ? campaign.callsPerSecond : 1;
    const msPerCall     = Math.max(100, Math.floor(1000 / cps));

    // Track active concurrency with a counter + condition variable pattern
    let activeCount     = 0;
    let dialedCount     = 0;
    const allPromises:  Promise<void>[] = [];
    const startTime     = campaign.startedAt?.getTime() ?? Date.now();

    const wrapCall = async (contact: any): Promise<void> => {
      activeCount++;
      try {
        await this.placeCall(campaign, contact);
      } catch (err: any) {
        this.logger.error(
          `Call error for ${contact.formattedPhone || contact.phone}: ${err.message}`,
        );
      } finally {
        activeCount--;
      }
    };

    for (const contact of contacts) {

      // ── Stop / pause check ──────────────────────────────────────────────
      if (this.runningCampaigns.get(campaignId) === false) {
        this.logger.log(`Campaign ${campaignId} stopped at ${dialedCount}/${total}`);
        break;
      }

      // Check DB status every 10 contacts to avoid excessive queries
      if (dialedCount % 10 === 0) {
        const fresh = await this.prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { status: true },
        });
        if (fresh?.status !== 'RUNNING') {
          this.logger.log(`Campaign ${campaignId} DB status=${fresh?.status}, stopping`);
          break;
        }
      }

      // ── Concurrency gate: poll until a slot opens ────────────────────────
      while (activeCount >= maxConcurrent) {
        await this.sleep(100);
        if (this.runningCampaigns.get(campaignId) === false) break;
      }
      if (this.runningCampaigns.get(campaignId) === false) break;

      // ── Emit live progress update ────────────────────────────────────────
      const elapsedMinutes = Math.max(0.01, (Date.now() - startTime) / 60000);
      const cpm = Math.round(dialedCount / elapsedMinutes);

      this.prisma.campaign.update({
        where: { id: campaignId },
        data: { activeCalls: activeCount, callsPerMinute: cpm },
      }).catch(() => {});

      this.wsGateway.emitToUser(userId, 'campaign:progress', {
        campaignId,
        dialedCount,
        total,
        activeCalls: activeCount,
        percent: Math.round((dialedCount / total) * 100),
        callsPerMinute: cpm,
      });

      // ── Place call (non-blocking) ─────────────────────────────────────────
      const p = wrapCall(contact);
      allPromises.push(p);
      dialedCount++;

      // Rate limiting — respect callsPerSecond
      await this.sleep(msPerCall);
    }

    // Wait for all in-flight calls to settle
    if (allPromises.length > 0) {
      this.logger.log(`Campaign ${campaignId}: waiting for ${activeCount} in-flight call(s)...`);
      await Promise.allSettled(allPromises);
    }

    // 6. Mark complete
    const finalStatus = this.runningCampaigns.get(campaignId) === false
      ? 'CANCELLED'
      : 'COMPLETED';

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: finalStatus as any, completedAt: new Date(), activeCalls: 0 },
    });

    this.eventEmitter.emit(`campaign.${finalStatus.toLowerCase()}`, { campaignId, userId });
    this.logger.log(`Campaign ${campaignId} ${finalStatus} (${dialedCount}/${total} dialed)`);
  }

  // ── Single call dispatch ──────────────────────────────────────────────────

  private async placeCall(campaign: any, contact: any) {
    const phone = contact.formattedPhone || contact.phone;
    if (!phone) return;

    // Create call log in QUEUED state
    const callLog = await this.prisma.callLog.create({
      data: {
        campaignId: campaign.id,
        contactId:  contact.id,
        phone,
        direction:  'outbound',
        status:     'QUEUED',
        // Temp UUID — will be updated when ESL assigns a real one
        uuid: `pending-${contact.id}-${Date.now()}`,
      },
    });

    try {
      await this.prisma.callLog.update({
        where: { id: callLog.id },
        data: { status: 'DIALING' },
      });

      // ESL originate — the gateway name IS the SIP account UUID
      const result = await this.esl.originate({
        destination:     phone,
        gatewayId:       campaign.sipAccountId,  // UUID → gateway name in FreeSWITCH
        callerIdNumber:  campaign.callerIdNumber || campaign.sipAccount.callerIdNumber,
        callerIdName:    campaign.callerIdName   || campaign.sipAccount.callerIdName,
        campaignId:      campaign.id,
        callLogId:       callLog.id,
        // Audio files — stored at /app/uploads/audio/<uuid>.mp3
        // FreeSWITCH reads from the same path via shared callspsy_uploads volume
        audioFile:       campaign.audioFile?.storagePath,
        voicemailAudio:  campaign.voicemailAudio?.storagePath,
        amdEnabled:      campaign.amdEnabled,
        amdAction:       campaign.amdAction,
        timeout:         60,
      });

      // Update call log with real FreeSWITCH UUID
      await this.prisma.callLog.update({
        where: { id: callLog.id },
        data: { uuid: result.uuid, status: 'RINGING' },
      });

      // Update campaign counters
      await this.prisma.campaign.update({
        where: { id: campaign.id },
        data: { processedContacts: { increment: 1 } },
      });

    } catch (err: any) {
      // Originate failed — mark as failed immediately
      const cause = err.message || 'ORIGINATE_FAILED';
      await this.prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          status:      'FAILED',
          hangupCause: cause,
          hangupAt:    new Date(),
          duration:    0,
        },
      });

      await this.prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          processedContacts: { increment: 1 },
          failedCalls:       { increment: 1 },
        },
      });

      this.logger.warn(`Originate failed for ${phone} in campaign ${campaign.id}: ${cause}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
