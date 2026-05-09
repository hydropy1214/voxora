import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { FreeswitchEslService } from './freeswitch-esl.service';
import { WebsocketGateway } from '../../gateways/websocket.gateway';

/**
 * SipService
 *
 * Listens to ESL events forwarded by FreeswitchEslService and:
 * 1. Updates CallLog records in the database
 * 2. Updates Campaign aggregate counters
 * 3. Broadcasts live events to the WebSocket gateway
 */
@Injectable()
export class SipService {
  private readonly logger = new Logger(SipService.name);

  constructor(
    private prisma: PrismaService,
    private esl: FreeswitchEslService,
    private wsGateway: WebsocketGateway,
  ) {}

  @OnEvent('freeswitch.channel_answer')
  async handleAnswer(payload: {
    uuid: string;
    callLogId: string;
    campaignId: string;
    phone: string;
    answeredAt: string;
  }) {
    if (!payload.uuid) return;

    await this.updateCallLog(payload.callLogId, payload.uuid, {
      status:     'ANSWERED',
      answeredAt: new Date(payload.answeredAt),
    });

    if (payload.campaignId) {
      this.wsGateway.emitCampaignEvent(payload.campaignId, 'call:answered', {
        uuid:      payload.uuid,
        phone:     payload.phone,
        timestamp: payload.answeredAt,
      });
    }
  }

  @OnEvent('freeswitch.channel_progress')
  async handleRinging(payload: { uuid: string; callLogId: string; campaignId: string }) {
    if (!payload.uuid) return;
    await this.updateCallLog(payload.callLogId, payload.uuid, { status: 'RINGING' });
  }

  @OnEvent('freeswitch.channel_hangup_complete')
  async handleHangup(payload: {
    uuid:          string;
    callLogId:     string;
    campaignId:    string;
    phone:         string;
    hangupCause:   string;
    duration:      number;
    amdResult?:    string;
    rtpPacketsLost?: number;
    rtpMos?:       number;
    sipStatus?:    number;
  }) {
    if (!payload.uuid) return;

    const cause = payload.hangupCause || 'UNKNOWN';

    // Map hangup cause to our status enum
    const status =
      ['NORMAL_CLEARING', 'SUCCESS'].includes(cause)      ? 'COMPLETED'  :
      cause === 'USER_BUSY'                                ? 'BUSY'       :
      ['NO_ANSWER', 'NO_USER_RESPONSE'].includes(cause)    ? 'NOANSWER'   :
      cause === 'ORIGINATOR_CANCEL'                        ? 'CANCELLED'  :
      'FAILED';

    const isAnswered  = status === 'COMPLETED';
    const isHuman     = payload.amdResult === 'HUMAN';
    const isMachine   = payload.amdResult === 'MACHINE';

    await this.updateCallLog(payload.callLogId, payload.uuid, {
      status:          status as any,
      hangupCause:     cause,
      hangupAt:        new Date(),
      duration:        payload.duration,
      billableDuration: isAnswered ? payload.duration : 0,
      amdResult:       payload.amdResult as any ?? null,
      rtpMos:          payload.rtpMos    ?? null,
      rtpPacketsLost:  payload.rtpPacketsLost ?? null,
      sipResponseCode: payload.sipStatus ?? null,
    });

    // Update campaign aggregate counters
    if (payload.campaignId) {
      const counters: any = { activeCalls: { decrement: 1 } };

      if (isAnswered) {
        counters.answeredCalls = { increment: 1 };
        counters.totalDuration = { increment: payload.duration };
        if (isHuman)   counters.humanAnswers   = { increment: 1 };
        if (isMachine) counters.machineAnswers = { increment: 1 };
      } else if (status === 'BUSY') {
        counters.busyCalls = { increment: 1 };
      } else if (status === 'NOANSWER') {
        counters.noanswer  = { increment: 1 };
      } else {
        counters.failedCalls = { increment: 1 };
      }

      try {
        await this.prisma.campaign.update({
          where: { id: payload.campaignId },
          data: counters,
        });
      } catch {}

      // Broadcast to WebSocket subscribers
      this.wsGateway.emitCampaignEvent(payload.campaignId, 'call:hangup', {
        uuid:        payload.uuid,
        phone:       payload.phone,
        hangupCause: cause,
        status,
        duration:    payload.duration,
        amdResult:   payload.amdResult,
        rtpMos:      payload.rtpMos,
      });
    }

    this.logger.debug(
      `Call ${payload.uuid}: ${cause} | amd=${payload.amdResult} | dur=${payload.duration}s`,
    );
  }

  @OnEvent('callspsy.human_answer')
  handleHumanAnswer(payload: any) {
    if (payload.campaignId) {
      this.wsGateway.emitCampaignEvent(payload.campaignId, 'amd:human', payload);
    }
  }

  @OnEvent('callspsy.machine_answer')
  handleMachineAnswer(payload: any) {
    if (payload.campaignId) {
      this.wsGateway.emitCampaignEvent(payload.campaignId, 'amd:machine', payload);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async updateCallLog(
    callLogId: string,
    uuid: string,
    data: Record<string, any>,
  ) {
    try {
      // Try by callLogId first (most reliable), then by uuid as fallback
      if (callLogId && !callLogId.startsWith('pending-')) {
        await this.prisma.callLog.update({ where: { id: callLogId }, data });
      } else {
        await this.prisma.callLog.updateMany({ where: { uuid }, data });
      }
    } catch (e: any) {
      // Log at debug level — missing call logs are non-fatal
      this.logger.debug(`updateCallLog(${callLogId}/${uuid}): ${e.message}`);
    }
  }
}
