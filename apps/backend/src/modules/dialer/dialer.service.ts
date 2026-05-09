import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FreeswitchEslService } from '../../services/sip/freeswitch-esl.service';
import { GatewayManagerService } from '../../services/sip/gateway-manager.service';
import { InitiateCallDto } from './dto/dialer.dto';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

export type DialerCallStatus =
  | 'INITIATING'
  | 'RINGING'
  | 'ANSWERED'
  | 'COMPLETED'
  | 'FAILED'
  | 'BUSY'
  | 'NO_ANSWER';

export interface DialerCall {
  id: string;
  userId: string;
  destination: string;
  callerIdNumber: string;
  callerIdName: string;
  sipAccountId: string;
  sipAccountName: string;
  status: DialerCallStatus;
  uuid?: string;
  duration: number;
  notes?: string;
  startedAt: Date;
  answeredAt?: Date;
  endedAt?: Date;
  hangupCause?: string;
}

@Injectable()
export class DialerService {
  private readonly logger = new Logger(DialerService.name);
  private activeCalls = new Map<string, DialerCall>();

  constructor(
    private prisma: PrismaService,
    private esl: FreeswitchEslService,
    private gatewayManager: GatewayManagerService,
    private eventEmitter: EventEmitter2,
  ) {}

  async initiateCall(userId: string, dto: InitiateCallDto): Promise<DialerCall> {
    const sipAccount = await this.prisma.sipAccount.findFirst({
      where: { id: dto.sipAccountId, userId, active: true },
    });

    if (!sipAccount) {
      throw new NotFoundException('SIP account not found or inactive');
    }

    if (!this.esl.isConnected()) {
      throw new BadRequestException('Calling service is currently unavailable. Please try again shortly.');
    }

    const callId = `dialer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const cidName = dto.callerIdName || sipAccount.callerIdName || 'CallsPsy';
    const cidNum  = dto.callerIdNumber || sipAccount.callerIdNumber || sipAccount.username;

    const call: DialerCall = {
      id: callId,
      userId,
      destination: dto.destination,
      callerIdNumber: cidNum,
      callerIdName: cidName,
      sipAccountId: sipAccount.id,
      sipAccountName: sipAccount.name,
      status: 'INITIATING',
      duration: 0,
      notes: dto.notes,
      startedAt: new Date(),
    };

    this.activeCalls.set(callId, call);
    this.eventEmitter.emit('dialer.call_update', call);

    try {
      const { uuid } = await this.esl.originateDirect({
        destination: dto.destination,
        gatewayId: sipAccount.id,
        callerIdNumber: cidNum,
        callerIdName: cidName,
        callId,
        timeout: 60,
      });

      call.uuid = uuid;
      call.status = 'RINGING';
      this.activeCalls.set(callId, call);
      this.eventEmitter.emit('dialer.call_update', call);

      await this.persistCallLog(call);
      return call;
    } catch (err: any) {
      call.status = 'FAILED';
      call.endedAt = new Date();
      call.hangupCause = err.message;
      this.activeCalls.delete(callId);
      this.eventEmitter.emit('dialer.call_update', call);
      await this.persistCallLog(call);
      throw new BadRequestException(`Call failed: ${err.message}`);
    }
  }

  async hangupCall(userId: string, callId: string): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call || call.userId !== userId) {
      throw new NotFoundException('Active call not found');
    }

    if (call.uuid && this.esl.isConnected()) {
      try {
        await this.esl.executeApi('uuid_kill', call.uuid);
      } catch (e: any) {
        this.logger.warn(`Hangup ESL error: ${e.message}`);
      }
    }

    call.status = 'COMPLETED';
    call.endedAt = new Date();
    if (call.answeredAt) {
      call.duration = Math.round((call.endedAt.getTime() - call.answeredAt.getTime()) / 1000);
    }
    this.activeCalls.delete(callId);
    this.eventEmitter.emit('dialer.call_update', call);
    await this.persistCallLog(call);
  }

  async getActiveCalls(userId: string): Promise<DialerCall[]> {
    return Array.from(this.activeCalls.values()).filter(c => c.userId === userId);
  }

  async getCallHistory(userId: string, limit = 50): Promise<any[]> {
    return this.prisma.dialerLog.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        sipAccount: { select: { name: true } },
      },
    });
  }

  async getStats(userId: string) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [total, completed, failed, totalDuration] = await Promise.all([
      this.prisma.dialerLog.count({ where: { userId, startedAt: { gte: since } } }),
      this.prisma.dialerLog.count({ where: { userId, status: 'COMPLETED', startedAt: { gte: since } } }),
      this.prisma.dialerLog.count({ where: { userId, status: { in: ['FAILED', 'BUSY', 'NO_ANSWER'] }, startedAt: { gte: since } } }),
      this.prisma.dialerLog.aggregate({ where: { userId, startedAt: { gte: since } }, _sum: { duration: true } }),
    ]);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayCalls = await this.prisma.dialerLog.count({ where: { userId, startedAt: { gte: today } } });

    return {
      total,
      completed,
      failed,
      todayCalls,
      totalDuration: totalDuration._sum.duration ?? 0,
      answerRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      activeCalls: (await this.getActiveCalls(userId)).length,
    };
  }

  @OnEvent('freeswitch.channel_answer')
  handleAnswer(payload: { uuid: string; callLogId: string; campaignId: string }) {
    for (const [, call] of this.activeCalls) {
      if (call.uuid === payload.uuid) {
        call.status = 'ANSWERED';
        call.answeredAt = new Date();
        this.eventEmitter.emit('dialer.call_update', call);
        break;
      }
    }
  }

  @OnEvent('freeswitch.channel_hangup_complete')
  async handleHangup(payload: { uuid: string; hangupCause: string; duration: number }) {
    for (const [callId, call] of this.activeCalls) {
      if (call.uuid === payload.uuid) {
        call.status = this.mapHangupCause(payload.hangupCause);
        call.endedAt = new Date();
        call.duration = payload.duration;
        call.hangupCause = payload.hangupCause;
        this.activeCalls.delete(callId);
        this.eventEmitter.emit('dialer.call_update', call);
        await this.persistCallLog(call);
        break;
      }
    }
  }

  private mapHangupCause(cause: string): DialerCallStatus {
    if (cause === 'NORMAL_CLEARING') return 'COMPLETED';
    if (cause === 'USER_BUSY' || cause === 'CALL_REJECTED') return 'BUSY';
    if (cause === 'NO_ANSWER' || cause === 'NO_USER_RESPONSE') return 'NO_ANSWER';
    return 'FAILED';
  }

  private async persistCallLog(call: DialerCall) {
    try {
      await this.prisma.dialerLog.upsert({
        where: { callId: call.id },
        create: {
          callId: call.id,
          userId: call.userId,
          destination: call.destination,
          callerIdNumber: call.callerIdNumber,
          callerIdName: call.callerIdName,
          sipAccountId: call.sipAccountId,
          status: call.status,
          duration: call.duration,
          notes: call.notes ?? null,
          uuid: call.uuid ?? null,
          hangupCause: call.hangupCause ?? null,
          startedAt: call.startedAt,
          answeredAt: call.answeredAt ?? null,
          endedAt: call.endedAt ?? null,
        },
        update: {
          status: call.status,
          duration: call.duration,
          uuid: call.uuid ?? undefined,
          hangupCause: call.hangupCause ?? undefined,
          answeredAt: call.answeredAt ?? undefined,
          endedAt: call.endedAt ?? undefined,
        },
      });
    } catch (e: any) {
      this.logger.warn(`Failed to persist dialer log: ${e.message}`);
    }
  }
}
