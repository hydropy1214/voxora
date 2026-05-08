import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { FreeswitchEslService } from './freeswitch-esl.service';

@Injectable()
export class SipService {
  private readonly logger = new Logger(SipService.name);

  constructor(
    private prisma: PrismaService,
    private esl: FreeswitchEslService,
  ) {}

  async originate(params: {
    destination: string;
    gateway: string;
    callerIdNumber?: string;
    callerIdName?: string;
    audioFile?: string;
    voicemailAudio?: string;
    campaignId: string;
    amdEnabled?: boolean;
    amdAction?: string;
    timeout?: number;
  }) {
    return this.esl.originate(params);
  }

  @OnEvent('freeswitch.channel_hangup_complete')
  async handleCallHangup(payload: {
    uuid: string;
    campaignId: string;
    hangupCause: string;
    duration: number;
    amdResult?: string;
    rtpPacketsLost?: string;
    rtpMos?: number;
  }) {
    if (!payload.uuid || !payload.campaignId) return;

    const callLog = await this.prisma.callLog.findFirst({
      where: { uuid: payload.uuid },
    });

    if (!callLog) return;

    const isAnswered = !['USER_BUSY', 'NO_ANSWER', 'NO_USER_RESPONSE', 'NORMAL_TEMPORARY_FAILURE'].includes(
      payload.hangupCause,
    );
    const isBusy = payload.hangupCause === 'USER_BUSY';
    const isNoAnswer = ['NO_ANSWER', 'NO_USER_RESPONSE'].includes(payload.hangupCause);
    const status = isAnswered ? 'COMPLETED' : isBusy ? 'BUSY' : isNoAnswer ? 'NOANSWER' : 'FAILED';
    const isHuman = payload.amdResult === 'HUMAN';
    const isMachine = payload.amdResult === 'MACHINE';

    await this.prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        status: status as any,
        hangupCause: payload.hangupCause,
        hangupAt: new Date(),
        duration: payload.duration,
        billableDuration: payload.duration,
        amdResult: payload.amdResult as any,
        rtpMos: payload.rtpMos,
        rtpPacketsLost: payload.rtpPacketsLost ? parseInt(payload.rtpPacketsLost) : undefined,
      },
    });

    // Update campaign stats
    const updates: any = {
      activeCalls: { decrement: 1 },
    };

    if (isAnswered) {
      updates.answeredCalls = { increment: 1 };
      updates.totalDuration = { increment: payload.duration };
      if (isHuman) updates.humanAnswers = { increment: 1 };
      if (isMachine) updates.machineAnswers = { increment: 1 };
    } else if (isBusy) {
      updates.busyCalls = { increment: 1 };
    } else if (isNoAnswer) {
      updates.noanswer = { increment: 1 };
    } else {
      updates.failedCalls = { increment: 1 };
    }

    await this.prisma.campaign.update({
      where: { id: payload.campaignId },
      data: updates,
    });

    this.logger.debug(`Call ${payload.uuid} completed: ${payload.hangupCause} (${payload.duration}s)`);
  }

  @OnEvent('freeswitch.channel_answer')
  async handleCallAnswer(payload: { uuid: string; answeredAt: string }) {
    if (!payload.uuid) return;
    await this.prisma.callLog.updateMany({
      where: { uuid: payload.uuid },
      data: { status: 'ANSWERED', answeredAt: new Date(payload.answeredAt) },
    });
  }

  @OnEvent('freeswitch.channel_progress')
  async handleCallRinging(payload: { uuid: string }) {
    if (!payload.uuid) return;
    await this.prisma.callLog.updateMany({
      where: { uuid: payload.uuid },
      data: { status: 'RINGING' },
    });
  }
}
