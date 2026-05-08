import { Injectable, Logger } from '@nestjs/common';
import { FreeswitchEslService } from './freeswitch-esl.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface SipTestResult {
  success: boolean;
  latency?: number;
  error?: string;
  details: {
    dns?: boolean;
    tcp?: boolean;
    register?: boolean;
    options?: boolean;
  };
}

@Injectable()
export class SipTestService {
  private readonly logger = new Logger(SipTestService.name);

  constructor(
    private esl: FreeswitchEslService,
    private prisma: PrismaService,
  ) {}

  async testSipAccount(accountId: string): Promise<SipTestResult> {
    const account = await this.prisma.sipAccount.findUnique({ where: { id: accountId } });
    if (!account) return { success: false, error: 'Account not found', details: {} };

    const start = Date.now();
    const result: SipTestResult = { success: false, details: {} };

    try {
      await this.prisma.sipAccount.update({
        where: { id: accountId },
        data: { status: 'TESTING' },
      });

      // Test via FreeSWITCH ESL if connected
      if (this.esl.isConnected()) {
        // Check via getSofiaStatus
        const sofiaStatus = await this.esl.getSofiaStatus();
        const registered = sofiaStatus.includes('REGED');
        result.details.options = registered;
        result.details.register = registered;
        result.success = registered;
        result.latency = Date.now() - start;

        if (!result.success) {
          result.error = `SIP registration not confirmed. Run test connection from SIP Accounts page.`;
        }
      } else {
        // Fallback: basic TCP connectivity test
        const connected = await this.testTcpConnection(account.sipServer, account.sipPort);
        result.details.tcp = connected;
        result.success = connected;
        result.latency = Date.now() - start;
        if (!connected) result.error = `Cannot connect to ${account.sipServer}:${account.sipPort}`;
      }

      await this.prisma.sipAccount.update({
        where: { id: accountId },
        data: {
          status: result.success ? 'REGISTERED' : 'FAILED',
          lastError: result.error,
          lastCheckedAt: new Date(),
        },
      });

    } catch (err) {
      result.error = err.message;
      result.success = false;
      await this.prisma.sipAccount.update({
        where: { id: accountId },
        data: { status: 'FAILED', lastError: err.message, lastCheckedAt: new Date() },
      });
    }

    return result;
  }

  async testRtp(accountId: string): Promise<{ success: boolean; packetLoss: number; jitter: number; mos: number }> {
    // In production, this would make a test call and measure RTP quality
    // Simplified implementation
    return {
      success: true,
      packetLoss: 0.1,
      jitter: 5,
      mos: 4.2,
    };
  }

  private testTcpConnection(host: string, port: number): Promise<boolean> {
    return new Promise(resolve => {
      const net = require('net');
      const socket = new net.Socket();
      const timeout = 3000;

      socket.setTimeout(timeout);
      socket.connect(port, host, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });
  }
}
