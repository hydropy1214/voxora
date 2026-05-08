import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as dayjs from 'dayjs';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats(userId: string) {
    const now = new Date();
    const todayStart = dayjs().startOf('day').toDate();
    const last30Days = dayjs().subtract(30, 'day').toDate();

    const [
      activeCampaigns,
      totalCampaigns,
      todayCalls,
      activeCalls,
      last30DaysCalls,
    ] = await Promise.all([
      this.prisma.campaign.count({ where: { userId, status: 'RUNNING' } }),
      this.prisma.campaign.count({ where: { userId } }),
      this.prisma.callLog.count({
        where: {
          campaign: { userId },
          createdAt: { gte: todayStart },
        },
      }),
      this.prisma.callLog.count({
        where: {
          campaign: { userId },
          status: { in: ['DIALING', 'RINGING', 'ANSWERED'] },
        },
      }),
      this.prisma.callLog.findMany({
        where: {
          campaign: { userId },
          createdAt: { gte: last30Days },
        },
        select: {
          status: true,
          amdResult: true,
          duration: true,
          rtpMos: true,
          createdAt: true,
        },
      }),
    ]);

    const answeredCalls = last30DaysCalls.filter(c => c.status === 'COMPLETED');
    const humanAnswers = last30DaysCalls.filter(c => c.amdResult === 'HUMAN');
    const machineAnswers = last30DaysCalls.filter(c => c.amdResult === 'MACHINE');
    const failedCalls = last30DaysCalls.filter(c => c.status === 'FAILED');

    const totalDuration = answeredCalls.reduce((sum, c) => sum + (c.duration || 0), 0);
    const avgDuration = answeredCalls.length > 0 ? totalDuration / answeredCalls.length : 0;

    const validMos = last30DaysCalls.filter(c => c.rtpMos && c.rtpMos > 0).map(c => c.rtpMos!);
    const avgMos = validMos.length > 0 ? validMos.reduce((sum, m) => sum + m, 0) / validMos.length : 0;

    return {
      activeCampaigns,
      totalCampaigns,
      todayCalls,
      activeCalls,
      last30Days: {
        totalCalls: last30DaysCalls.length,
        answeredCalls: answeredCalls.length,
        humanAnswers: humanAnswers.length,
        machineAnswers: machineAnswers.length,
        failedCalls: failedCalls.length,
        answerRate: last30DaysCalls.length > 0
          ? (answeredCalls.length / last30DaysCalls.length) * 100 : 0,
        humanRate: answeredCalls.length > 0
          ? (humanAnswers.length / answeredCalls.length) * 100 : 0,
        machineRate: answeredCalls.length > 0
          ? (machineAnswers.length / answeredCalls.length) * 100 : 0,
        failureRate: last30DaysCalls.length > 0
          ? (failedCalls.length / last30DaysCalls.length) * 100 : 0,
        avgDuration: Math.round(avgDuration),
        totalDuration,
        avgMos: avgMos.toFixed(2),
      },
    };
  }

  async getCallsTimeline(userId: string, days = 30) {
    const start = dayjs().subtract(days, 'day').toDate();

    const calls = await this.prisma.callLog.findMany({
      where: { campaign: { userId }, createdAt: { gte: start } },
      select: { createdAt: true, status: true, amdResult: true, duration: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const grouped = new Map<string, {
      date: string; total: number; answered: number;
      human: number; machine: number; failed: number;
    }>();

    for (let i = 0; i < days; i++) {
      const date = dayjs().subtract(days - 1 - i, 'day').format('YYYY-MM-DD');
      grouped.set(date, { date, total: 0, answered: 0, human: 0, machine: 0, failed: 0 });
    }

    for (const call of calls) {
      const date = dayjs(call.createdAt).format('YYYY-MM-DD');
      const entry = grouped.get(date);
      if (!entry) continue;
      entry.total++;
      if (call.status === 'COMPLETED') entry.answered++;
      if (call.amdResult === 'HUMAN') entry.human++;
      if (call.amdResult === 'MACHINE') entry.machine++;
      if (call.status === 'FAILED') entry.failed++;
    }

    return Array.from(grouped.values());
  }

  async getCampaignPerformance(userId: string) {
    return this.prisma.campaign.findMany({
      where: { userId, status: { in: ['COMPLETED', 'RUNNING'] } },
      select: {
        id: true, name: true, status: true,
        totalContacts: true, processedContacts: true,
        answeredCalls: true, humanAnswers: true, machineAnswers: true,
        failedCalls: true, avgDuration: true, startedAt: true, completedAt: true,
      },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });
  }

  async getRtpStats(userId: string) {
    const calls = await this.prisma.callLog.findMany({
      where: {
        campaign: { userId },
        rtpMos: { not: null },
        createdAt: { gte: dayjs().subtract(7, 'day').toDate() },
      },
      select: { rtpMos: true, rtpJitter: true, rtpPacketsLost: true, createdAt: true },
    });

    const mosValues = calls.map(c => c.rtpMos!).filter(m => m > 0);
    const avgMos = mosValues.length > 0 ? mosValues.reduce((a, b) => a + b, 0) / mosValues.length : 0;
    const excellentCalls = mosValues.filter(m => m >= 4.0).length;
    const goodCalls = mosValues.filter(m => m >= 3.5 && m < 4.0).length;
    const poorCalls = mosValues.filter(m => m < 3.5).length;

    return {
      totalMeasured: mosValues.length,
      avgMos: parseFloat(avgMos.toFixed(2)),
      excellentCalls,
      goodCalls,
      poorCalls,
      stability: mosValues.length > 0 ? (excellentCalls / mosValues.length) * 100 : 100,
    };
  }

  async getRecentEvents(userId: string, limit = 10) {
    return this.prisma.callLog.findMany({
      where: { campaign: { userId } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        campaign: { select: { id: true, name: true } },
        contact: { select: { phone: true, firstName: true, lastName: true } },
      },
    });
  }
}
