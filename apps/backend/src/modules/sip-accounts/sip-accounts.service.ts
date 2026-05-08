import {
  Injectable, NotFoundException, Logger, OnModuleInit,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { GatewayManagerService } from '../../services/sip/gateway-manager.service';
import { CryptoService } from '../../services/crypto/crypto.service';
import { CreateSipAccountDto } from './dto/create-sip-account.dto';
import { UpdateSipAccountDto } from './dto/update-sip-account.dto';

@Injectable()
export class SipAccountsService implements OnModuleInit {
  private readonly logger = new Logger(SipAccountsService.name);

  constructor(
    private prisma: PrismaService,
    private gatewayManager: GatewayManagerService,
    private crypto: CryptoService,
  ) {}

  /**
   * On startup: re-register all active SIP accounts with FreeSWITCH.
   * This handles server restarts — gateways are lost when FreeSWITCH restarts.
   */
  async onModuleInit() {
    // Defer until FreeSWITCH ESL is connected
    setTimeout(() => this.reregisterAll(), 15_000);
  }

  /**
   * Re-register all active accounts when FreeSWITCH reconnects after a restart.
   */
  @OnEvent('freeswitch.connected')
  async reregisterAll() {
    try {
      const accounts = await this.prisma.sipAccount.findMany({
        where: { active: true },
      });

      this.logger.log(`Re-registering ${accounts.length} SIP account(s) with FreeSWITCH...`);

      for (const account of accounts) {
        await this.registerWithFreeSWITCH(account);
      }
    } catch (e: any) {
      this.logger.warn(`Re-registration error: ${e.message}`);
    }
  }

  async create(userId: string, dto: CreateSipAccountDto) {
    // Encrypt password with AES-256 (reversible, needed for SIP REGISTER)
    const passwordHash = this.crypto.encrypt(dto.password);

    const account = await this.prisma.sipAccount.create({
      data: {
        userId,
        name: dto.name,
        sipServer:         dto.sipServer,
        sipPort:           dto.sipPort          ?? 5060,
        username:          dto.username,
        passwordHash,
        transport:         (dto.transport        ?? 'UDP') as any,
        proxy:             dto.proxy,
        outboundProxy:     dto.outboundProxy,
        fromDomain:        dto.fromDomain,
        callerIdName:      dto.callerIdName,
        callerIdNumber:    dto.callerIdNumber,
        maxConcurrentCalls: dto.maxConcurrentCalls ?? 10,
        callsPerSecond:    dto.callsPerSecond    ?? 1.0,
      },
    });

    // Register gateway with FreeSWITCH (non-blocking — ESL may not be ready yet)
    this.registerWithFreeSWITCH(account).catch(err =>
      this.logger.warn(`Gateway registration deferred: ${err.message}`),
    );

    const { passwordHash: _, ...safe } = account;
    return safe;
  }

  async findAll(userId: string) {
    const accounts = await this.prisma.sipAccount.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch live registration status from FreeSWITCH
    const gatewayStatuses = await this.gatewayManager.listGateways();
    const statusMap = new Map(gatewayStatuses.map(g => [g.id, g.status]));

    return accounts.map(({ passwordHash, ...acc }) => ({
      ...acc,
      liveStatus: statusMap.get(acc.id) ?? acc.status,
    }));
  }

  async findOne(userId: string, id: string) {
    const account = await this.prisma.sipAccount.findFirst({
      where: { id, userId, active: true },
    });
    if (!account) throw new NotFoundException('SIP account not found');

    const liveStatus = await this.gatewayManager.getStatus(id);
    const { passwordHash, ...safe } = account;
    return { ...safe, liveStatus };
  }

  async update(userId: string, id: string, dto: UpdateSipAccountDto) {
    await this.assertOwnership(userId, id);

    const data: any = { ...dto };
    if (dto.password) {
      data.passwordHash = this.crypto.encrypt(dto.password);
      delete data.password;
    }

    const updated = await this.prisma.sipAccount.update({
      where: { id },
      data,
    });

    // Re-register with updated credentials
    this.registerWithFreeSWITCH(updated).catch(err =>
      this.logger.warn(`Gateway update deferred: ${err.message}`),
    );

    const { passwordHash: _, ...safe } = updated;
    return safe;
  }

  async remove(userId: string, id: string) {
    await this.assertOwnership(userId, id);

    // Unregister from FreeSWITCH
    await this.gatewayManager.unregister(id);

    await this.prisma.sipAccount.update({
      where: { id },
      data: { active: false },
    });

    return { success: true };
  }

  /**
   * Test SIP connectivity for an account.
   * Returns registration status + latency.
   */
  async testConnection(userId: string, id: string) {
    const account = await this.prisma.sipAccount.findFirst({
      where: { id, userId },
    });
    if (!account) throw new NotFoundException('SIP account not found');

    await this.prisma.sipAccount.update({
      where: { id },
      data: { status: 'TESTING' },
    });

    const start = Date.now();

    // Force re-registration
    const result = await this.registerWithFreeSWITCH(account);

    // Wait a moment for REGISTER response
    await new Promise(r => setTimeout(r, 3000));

    const liveStatus = await this.gatewayManager.getStatus(id);
    const latencyMs = Date.now() - start;

    const registered = liveStatus === 'REGISTERED';

    await this.prisma.sipAccount.update({
      where: { id },
      data: {
        status: registered ? 'REGISTERED' : 'FAILED' as any,
        lastCheckedAt: new Date(),
        lastError: registered ? null : `Registration status: ${liveStatus}`,
      },
    });

    return {
      success: registered,
      status: liveStatus,
      latencyMs,
      detail: result.error ?? (registered ? 'Gateway registered successfully' : `Gateway status: ${liveStatus}`),
    };
  }

  /**
   * Get the plaintext password for a SIP account (used by campaign processor).
   */
  async getPlaintextPassword(id: string): Promise<string> {
    const account = await this.prisma.sipAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('SIP account not found');
    return this.gatewayManager.decryptPassword(account.passwordHash);
  }

  /**
   * Update the status field of an account (called by ESL event handlers).
   */
  async updateStatus(id: string, status: string, lastError?: string) {
    return this.prisma.sipAccount.update({
      where: { id },
      data: { status: status as any, lastError: lastError ?? null, lastCheckedAt: new Date() },
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async registerWithFreeSWITCH(account: any) {
    try {
      const password = this.gatewayManager.decryptPassword(account.passwordHash);

      return await this.gatewayManager.register({
        id:                account.id,
        name:              account.name,
        sipServer:         account.sipServer,
        sipPort:           account.sipPort,
        username:          account.username,
        password,
        transport:         account.transport.toLowerCase() as any,
        proxy:             account.proxy,
        outboundProxy:     account.outboundProxy,
        fromDomain:        account.fromDomain,
        callerIdNumber:    account.callerIdNumber,
        callerIdName:      account.callerIdName,
        maxConcurrentCalls: account.maxConcurrentCalls,
      });
    } catch (e: any) {
      this.logger.warn(`Register failed for ${account.id}: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  private async assertOwnership(userId: string, id: string) {
    const account = await this.prisma.sipAccount.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException('SIP account not found');
    return account;
  }
}
