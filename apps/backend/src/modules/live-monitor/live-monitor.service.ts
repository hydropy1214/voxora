import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FreeswitchEslService } from '../../services/sip/freeswitch-esl.service';

@Injectable()
export class LiveMonitorService {
  constructor(
    private prisma: PrismaService,
    private esl: FreeswitchEslService,
  ) {}

  async getLiveStats(userId: string) {
    const [activeCampaigns, activeCalls, recentCalls, sipStatus] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { userId, status: 'RUNNING' },
        select: {
          id: true, name: true, status: true,
          activeCalls: true, callsPerMinute: true,
          processedContacts: true, totalContacts: true,
          humanAnswers: true, machineAnswers: true,
          failedCalls: true, answeredCalls: true,
        },
      }),
      this.prisma.callLog.count({
        where: {
          campaign: { userId },
          status: { in: ['DIALING', 'RINGING', 'ANSWERED'] },
        },
      }),
      this.prisma.callLog.findMany({
        where: { campaign: { userId } },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, phone: true, status: true, amdResult: true,
          duration: true, hangupCause: true, rtpMos: true, createdAt: true,
          campaign: { select: { id: true, name: true } },
        },
      }),
      this.getSipStatus(userId),
    ]);

    const totalActive = activeCampaigns.reduce((sum, c) => sum + c.activeCalls, 0);
    const totalCpm = activeCampaigns.reduce((sum, c) => sum + c.callsPerMinute, 0);

    return {
      activeCampaigns,
      activeCalls: totalActive,
      callsPerMinute: totalCpm,
      recentCalls,
      sipStatus,
      freeswitchConnected: this.esl.isConnected(),
      timestamp: new Date().toISOString(),
    };
  }

  async getSipStatus(userId: string) {
    const accounts = await this.prisma.sipAccount.findMany({
      where: { userId, active: true },
      select: { id: true, name: true, sipServer: true, status: true, lastCheckedAt: true },
    });

    return accounts;
  }

  async getSipLogs(userId: string, limit = 50) {
    return this.prisma.sipLog.findMany({
      where: { sipAccount: { userId } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { sipAccount: { select: { name: true } } },
    });
  }

  async getRtpMetrics(userId: string) {
    const recent = await this.prisma.callLog.findMany({
      where: {
        campaign: { userId },
        rtpMos: { not: null },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
      },
      select: { rtpMos: true, rtpJitter: true, rtpPacketsLost: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return recent.map(r => ({
      timestamp: r.createdAt,
      mos: r.rtpMos,
      jitter: r.rtpJitter,
      packetLoss: r.rtpPacketsLost,
    }));
  }
}
