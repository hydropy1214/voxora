import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSipAccountDto } from './dto/create-sip-account.dto';
import { UpdateSipAccountDto } from './dto/update-sip-account.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class SipAccountsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateSipAccountDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.sipAccount.create({
      data: {
        userId,
        name: dto.name,
        sipServer: dto.sipServer,
        sipPort: dto.sipPort ?? 5060,
        username: dto.username,
        passwordHash,
        transport: dto.transport ?? 'UDP',
        proxy: dto.proxy,
        outboundProxy: dto.outboundProxy,
        fromDomain: dto.fromDomain,
        callerIdName: dto.callerIdName,
        callerIdNumber: dto.callerIdNumber,
        maxConcurrentCalls: dto.maxConcurrentCalls ?? 10,
        callsPerSecond: dto.callsPerSecond ?? 1.0,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.sipAccount.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, sipServer: true, sipPort: true,
        username: true, transport: true, proxy: true, outboundProxy: true,
        fromDomain: true, callerIdName: true, callerIdNumber: true,
        maxConcurrentCalls: true, callsPerSecond: true,
        status: true, lastCheckedAt: true, lastError: true,
        active: true, createdAt: true, updatedAt: true,
      },
    });
  }

  async findOne(userId: string, id: string) {
    const account = await this.prisma.sipAccount.findFirst({
      where: { id, userId, active: true },
    });
    if (!account) throw new NotFoundException('SIP account not found');
    const { passwordHash, ...safe } = account;
    return safe;
  }

  async update(userId: string, id: string, dto: UpdateSipAccountDto) {
    await this.assertOwnership(userId, id);
    const data: any = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      delete data.password;
    }
    return this.prisma.sipAccount.update({ where: { id }, data });
  }

  async remove(userId: string, id: string) {
    await this.assertOwnership(userId, id);
    await this.prisma.sipAccount.update({ where: { id }, data: { active: false } });
    return { success: true };
  }

  async updateStatus(id: string, status: string, lastError?: string) {
    return this.prisma.sipAccount.update({
      where: { id },
      data: { status: status as any, lastError, lastCheckedAt: new Date() },
    });
  }

  async getDecryptedPassword(id: string): Promise<string> {
    const acc = await this.prisma.sipAccount.findUnique({ where: { id } });
    // Note: In production, use proper encryption (not bcrypt) for SIP passwords
    // since we need to retrieve the plain text password for SIP registration
    // This is a simplified version - use AES encryption in production
    return acc?.passwordHash ?? '';
  }

  private async assertOwnership(userId: string, id: string) {
    const account = await this.prisma.sipAccount.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException('SIP account not found');
    if (account.userId !== userId) throw new ForbiddenException();
    return account;
  }
}
