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

  async getRangeStats(userId: string, from: string, to: string, groupBy: 'day' | 'week' | 'month' = 'day') {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const toDate   = to   ? new Date(to)   : new Date();
    toDate.setHours(23, 59, 59, 999);

    const calls = await this.prisma.callLog.findMany({
      where: { campaign: { userId }, createdAt: { gte: fromDate, lte: toDate } },
      select: { status: true, amdResult: true, duration: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const buckets = new Map<string, { date: string; total: number; answered: number; human: number; machine: number; failed: number; totalDuration: number }>();

    for (const c of calls) {
      let key: string;
      const d = dayjs(c.createdAt);
      if (groupBy === 'month')     key = d.format('YYYY-MM');
      else if (groupBy === 'week') key = d.startOf('week').format('YYYY-MM-DD');
      else                         key = d.format('YYYY-MM-DD');

      if (!buckets.has(key)) buckets.set(key, { date: key, total: 0, answered: 0, human: 0, machine: 0, failed: 0, totalDuration: 0 });
      const b = buckets.get(key)!;
      b.total++;
      b.totalDuration += c.duration ?? 0;
      if (c.status === 'COMPLETED') b.answered++;
      if (c.amdResult === 'HUMAN')    b.human++;
      if (c.amdResult === 'MACHINE')  b.machine++;
      if (c.status === 'FAILED' || c.status === 'BUSY') b.failed++;
    }

    const summary = {
      totalCalls:    calls.length,
      answeredCalls: calls.filter(c => c.status === 'COMPLETED').length,
      humanAnswers:  calls.filter(c => c.amdResult === 'HUMAN').length,
      machineAnswers: calls.filter(c => c.amdResult === 'MACHINE').length,
      failedCalls:   calls.filter(c => c.status === 'FAILED' || c.status === 'BUSY').length,
      totalDuration: calls.reduce((a, c) => a + (c.duration ?? 0), 0),
    };
    const answerRate = summary.totalCalls > 0 ? (summary.answeredCalls / summary.totalCalls * 100) : 0;
    const humanRate  = summary.answeredCalls > 0 ? (summary.humanAnswers / summary.answeredCalls * 100) : 0;

    return {
      from: fromDate.toISOString(),
      to:   toDate.toISOString(),
      groupBy,
      summary: { ...summary, answerRate, humanRate },
      timeline: Array.from(buckets.values()),
    };
  }

  async getCampaignReport(userId: string, from: string, to: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const toDate   = to   ? new Date(to)   : new Date();
    toDate.setHours(23, 59, 59, 999);

    const campaigns = await this.prisma.campaign.findMany({
      where: { userId, createdAt: { gte: fromDate, lte: toDate } },
      include: {
        _count: { select: { callLogs: true } },
        sipAccount: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return campaigns.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      sipAccount: c.sipAccount?.name ?? '—',
      totalContacts: c.totalContacts,
      dialedCount: c.processedContacts,
      answeredCount: c.answeredCalls,
      humanCount: c.humanAnswers,
      machineCount: c.machineAnswers,
      failedCount: c.failedCalls,
      answerRate: c.processedContacts > 0 ? +(c.answeredCalls / c.processedContacts * 100).toFixed(1) : 0,
      humanRate:  c.answeredCalls > 0     ? +(c.humanAnswers  / c.answeredCalls  * 100).toFixed(1) : 0,
      avgDuration: c.avgDuration ?? 0,
      totalDuration: c.totalDuration ?? 0,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      createdAt: c.createdAt,
    }));
  }

  async getDialerReport(userId: string, from: string, to: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const toDate   = to   ? new Date(to)   : new Date();
    toDate.setHours(23, 59, 59, 999);

    const logs = await this.prisma.dialerLog.findMany({
      where: { userId, startedAt: { gte: fromDate, lte: toDate } },
      include: { sipAccount: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
    });

    const summary = {
      total:     logs.length,
      completed: logs.filter(l => l.status === 'COMPLETED').length,
      failed:    logs.filter(l => ['FAILED', 'BUSY', 'NO_ANSWER'].includes(l.status)).length,
      totalDuration: logs.reduce((a, l) => a + l.duration, 0),
      answerRate: logs.length > 0 ? +(logs.filter(l => l.status === 'COMPLETED').length / logs.length * 100).toFixed(1) : 0,
    };

    return { summary, records: logs.map(l => ({
      callId: l.callId,
      destination: l.destination,
      callerIdNumber: l.callerIdNumber,
      sipAccount: l.sipAccount?.name ?? '—',
      status: l.status,
      duration: l.duration,
      notes: l.notes,
      hangupCause: l.hangupCause,
      startedAt: l.startedAt,
      answeredAt: l.answeredAt,
      endedAt: l.endedAt,
    }))};
  }

  async getContactReport(userId: string) {
    const lists = await this.prisma.contactList.findMany({
      where: { userId },
      include: {
        _count: { select: { contacts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return lists.map(l => ({
      id: l.id,
      name: l.name,
      description: l.description,
      totalCount: l.totalCount,
      validCount: l.validCount,
      contactCount: l._count.contacts,
      createdAt: l.createdAt,
    }));
  }
}
